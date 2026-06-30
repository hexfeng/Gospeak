use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Sample,
};
use std::{
    fs::File,
    io::BufWriter,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

type SharedWriter = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

pub struct ActiveRecording {
    pub path: PathBuf,
    stream: cpal::Stream,
    writer: SharedWriter,
}

impl std::fmt::Debug for ActiveRecording {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ActiveRecording")
            .field("path", &self.path)
            .finish_non_exhaustive()
    }
}

impl ActiveRecording {
    pub fn stop(self) -> Result<PathBuf, String> {
        drop(self.stream);
        if let Some(writer) = self
            .writer
            .lock()
            .map_err(|_| "Recorder lock poisoned".to_string())?
            .take()
        {
            writer
                .finalize()
                .map_err(|error| format!("Cannot finalize WAV file: {error}"))?;
        }
        normalize_recording_for_stt(&self.path)?;
        Ok(self.path)
    }
}

pub fn start_recording_to_temp() -> Result<ActiveRecording, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No input microphone is available".to_string())?;
    let config = device
        .default_input_config()
        .map_err(|error| format!("Cannot read microphone config: {error}"))?;

    let path = std::env::temp_dir().join(format!("gospeak-{}.wav", uuid::Uuid::new_v4()));
    let writer = create_wav_writer(&path, config.sample_rate(), config.channels())?;
    let writer = Arc::new(Mutex::new(Some(writer)));
    let writer_for_stream = writer.clone();
    let stream_config = config.clone().into();
    let error_handler = |error| log::error!("Audio stream error: {error}");

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| write_samples(data, &writer_for_stream),
            error_handler,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| write_samples(data, &writer_for_stream),
            error_handler,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| write_samples(data, &writer_for_stream),
            error_handler,
            None,
        ),
        sample_format => {
            return Err(format!(
                "Unsupported microphone sample format: {sample_format:?}"
            ));
        }
    }
    .map_err(|error| format!("Cannot build audio input stream: {error}"))?;

    stream
        .play()
        .map_err(|error| format!("Cannot start microphone recording: {error}"))?;

    Ok(ActiveRecording {
        path,
        stream,
        writer,
    })
}

pub fn remove_gospeak_temp_audio_file(path: &Path) -> Result<bool, String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Temporary audio path is invalid".to_string())?;
    let is_gospeak_wav = file_name.starts_with("gospeak-")
        && path.extension().and_then(|value| value.to_str()) == Some("wav");
    if !is_gospeak_wav {
        return Err("Refusing to delete a non-Gospeak temporary WAV file".to_string());
    }

    if !path.exists() {
        return Ok(false);
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("Cannot resolve temporary audio path: {error}"))?;
    let temp_dir = std::env::temp_dir()
        .canonicalize()
        .map_err(|error| format!("Cannot resolve temporary directory: {error}"))?;
    if !canonical_path.starts_with(temp_dir) {
        return Err("Refusing to delete an audio file outside the temp directory".to_string());
    }

    std::fs::remove_file(&canonical_path)
        .map_err(|error| format!("Cannot delete temporary audio file: {error}"))?;
    Ok(true)
}

fn create_wav_writer(
    path: &PathBuf,
    sample_rate: u32,
    channels: u16,
) -> Result<hound::WavWriter<BufWriter<File>>, String> {
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    hound::WavWriter::create(path, spec)
        .map_err(|error| format!("Cannot create temporary WAV file: {error}"))
}

fn normalize_recording_for_stt(path: &Path) -> Result<(), String> {
    const TARGET_SAMPLE_RATE: u32 = 16_000;
    const TARGET_CHANNELS: u16 = 1;

    let (spec, mono_samples) = {
        let mut reader = hound::WavReader::open(path)
            .map_err(|error| format!("Cannot read WAV file: {error}"))?;
        let spec = reader.spec();
        if spec.channels == 0 {
            return Err("WAV file has no audio channels".to_string());
        }
        if spec.bits_per_sample != 16 || spec.sample_format != hound::SampleFormat::Int {
            return Err("Only 16-bit PCM WAV recordings can be optimized for STT".to_string());
        }
        if spec.channels == TARGET_CHANNELS && spec.sample_rate == TARGET_SAMPLE_RATE {
            return Ok(());
        }

        let channels = usize::from(spec.channels);
        let samples = reader
            .samples::<i16>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Cannot read WAV samples: {error}"))?;
        let mono = samples
            .chunks(channels)
            .filter(|frame| frame.len() == channels)
            .map(|frame| {
                let sum: i32 = frame.iter().map(|sample| i32::from(*sample)).sum();
                (sum / i32::try_from(channels).unwrap_or(1)) as i16
            })
            .collect::<Vec<_>>();
        (spec, mono)
    };

    if mono_samples.is_empty() {
        return Err("WAV recording is empty".to_string());
    }

    let target_len = ((mono_samples.len() as f64) * f64::from(TARGET_SAMPLE_RATE)
        / f64::from(spec.sample_rate))
    .round()
    .max(1.0) as usize;
    let temp_path = path.with_file_name(format!("gospeak-{}.stt.wav", uuid::Uuid::new_v4()));
    let mut writer = hound::WavWriter::create(
        &temp_path,
        hound::WavSpec {
            channels: TARGET_CHANNELS,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|error| format!("Cannot create optimized WAV file: {error}"))?;

    for target_index in 0..target_len {
        let source_index = ((target_index as f64) * f64::from(spec.sample_rate)
            / f64::from(TARGET_SAMPLE_RATE))
        .floor() as usize;
        let sample = mono_samples
            .get(source_index)
            .or_else(|| mono_samples.last())
            .copied()
            .unwrap_or_default();
        writer
            .write_sample(sample)
            .map_err(|error| format!("Cannot write optimized WAV sample: {error}"))?;
    }
    writer
        .finalize()
        .map_err(|error| format!("Cannot finalize optimized WAV file: {error}"))?;
    std::fs::copy(&temp_path, path)
        .map_err(|error| format!("Cannot replace recording with optimized WAV: {error}"))?;
    let _ = std::fs::remove_file(&temp_path);
    Ok(())
}

fn write_samples<T>(data: &[T], writer: &SharedWriter)
where
    T: cpal::Sample + cpal::SizedSample,
    i16: cpal::FromSample<T>,
{
    if let Ok(mut guard) = writer.lock() {
        if let Some(writer) = guard.as_mut() {
            for sample in data {
                let converted: i16 = i16::from_sample(*sample);
                let _ = writer.write_sample(converted);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    #[test]
    fn temp_recording_paths_are_wav_files() {
        let path = std::env::temp_dir().join(format!("gospeak-{}.wav", uuid::Uuid::new_v4()));
        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("wav")
        );
    }

    #[test]
    fn removes_only_gospeak_temp_wav_files() {
        let path = std::env::temp_dir().join(format!("gospeak-{}.wav", uuid::Uuid::new_v4()));
        std::fs::File::create(&path)
            .unwrap()
            .write_all(b"temporary audio")
            .unwrap();

        assert!(super::remove_gospeak_temp_audio_file(&path).unwrap());
        assert!(!path.exists());
    }

    #[test]
    fn rejects_non_gospeak_temp_file_cleanup() {
        let path = std::env::temp_dir().join(format!("not-gospeak-{}.wav", uuid::Uuid::new_v4()));
        std::fs::File::create(&path).unwrap();

        let result = super::remove_gospeak_temp_audio_file(&path);

        assert!(result.is_err());
        assert!(path.exists());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn normalizes_recording_for_stt_to_16khz_mono() {
        let path = std::env::temp_dir().join(format!("gospeak-{}.wav", uuid::Uuid::new_v4()));
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        {
            let mut writer = hound::WavWriter::create(&path, spec).unwrap();
            for frame in 0..48_000 {
                let sample = if frame % 2 == 0 { i16::MAX / 3 } else { 0 };
                writer.write_sample(sample).unwrap();
                writer.write_sample(sample).unwrap();
            }
            writer.finalize().unwrap();
        }
        let original_size = std::fs::metadata(&path).unwrap().len();

        super::normalize_recording_for_stt(&path).unwrap();

        let reader = hound::WavReader::open(&path).unwrap();
        let normalized = reader.spec();
        let normalized_samples = reader.duration();
        let normalized_size = std::fs::metadata(&path).unwrap().len();
        assert_eq!(normalized.channels, 1);
        assert_eq!(normalized.sample_rate, 16_000);
        assert_eq!(normalized_samples, 16_000);
        assert!(normalized_size < original_size);

        let _ = std::fs::remove_file(path);
    }
}
