# Local Qwen3-ASR 0.6B Service

Gospeak can manage an existing Qwen3-ASR Python environment, but it never loads
the model automatically. Qwen Local is optional: activating its ASR
configuration does not start Python or reserve GPU memory.

## Requirements

- Windows with a CUDA-capable GPU.
- Python 3.12 in a dedicated virtual environment.
- Model `Qwen/Qwen3-ASR-0.6B-hf` already present in the local Hugging Face cache.
- A runtime directory containing:

```text
<runtime>\.venv\Scripts\python.exe
<runtime>\transcribe.py
<runtime>\server.py
<runtime>\requirements-server.txt
```

Install only the HTTP service dependencies into the existing environment:

```powershell
<runtime>\.venv\Scripts\python.exe -m pip install -r <runtime>\requirements-server.txt
```

Gospeak sets Hugging Face offline mode for the managed process. Missing model
files cause a clear startup failure; Gospeak does not download Python,
dependencies, or model weights.

## Configure and start

1. In Providers, add or edit a `Qwen Local` ASR configuration.
2. Keep model `Qwen/Qwen3-ASR-0.6B` and managed endpoint
   `http://127.0.0.1:8000/v1`.
3. Select the local runtime directory. The directory is stored only in the
   local SQLite preferences and is excluded from configuration exports.
4. Save the configuration and select `Use for ASR`.
5. Click `Start local model`.

The row moves from `Stopped` to `Starting` and then `Ready` after Gospeak
verifies `/health`. Recording before Ready returns an actionable local-service
error and never starts the model implicitly.

Once manually started, Qwen remains loaded if another ASR configuration such as
Groq is selected. Click `Stop local model` to release it. The Stop action remains
available on the Qwen configuration row even when it is not active.

## Lifecycle and privacy

- Gospeak starts only the Python process selected by the configured runtime.
- Inference requests are serialized to avoid concurrent GPU memory spikes.
- Uploaded WAV files use a process-specific temporary directory and are removed
  after requests; Gospeak removes the directory after stopping the process.
- Child output is written to `qwen-local.log` under the Gospeak app log directory.
- Stop and tray Quit terminate and wait for the process before removing its
  temporary directory.
- Gospeak never terminates a process by port or executable name.
- Provider failures never trigger cloud ASR fallback.

Custom loopback endpoints remain external compatible services. Gospeak sends
the existing OpenAI-compatible multipart request to them but does not show
managed Start/Stop controls or terminate those processes.

## HTTP contract

The managed service listens only on `127.0.0.1:8000` and exposes:

```text
GET  /health
POST /v1/audio/transcriptions
```

The transcription endpoint accepts multipart fields `file` and `model`, and
returns JSON containing `text`.
