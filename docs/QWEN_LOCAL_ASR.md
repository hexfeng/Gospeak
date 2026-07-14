# Local Qwen3-ASR 0.6B Service

Gospeak connects to a user-managed Qwen3-ASR service. The application and its
installers do not contain Python, model weights, a downloader, or a background
model process.

## Requirements

- Python 3.12 in a dedicated virtual environment.
- A Qwen3-ASR server that exposes the OpenAI-compatible
  `/v1/audio/transcriptions` endpoint.
- Model `Qwen/Qwen3-ASR-0.6B`.
- A loopback listener such as `127.0.0.1:8000`; Gospeak rejects remote hosts for
  the `qwen-local` Provider.

Follow the current upstream installation and serving instructions in the
[Qwen3-ASR repository](https://github.com/QwenLM/Qwen3-ASR). A typical service
layout is:

```powershell
py -3.12 -m venv .venv-qwen-asr
.\.venv-qwen-asr\Scripts\Activate.ps1
# Install qwen-asr and its upstream runtime dependencies.
# Start qwen-asr-serve with Qwen/Qwen3-ASR-0.6B on port 8000.
```

In Gospeak Settings, choose `Qwen Local`, keep the model fixed to
`Qwen/Qwen3-ASR-0.6B`, and use `http://127.0.0.1:8000/v1` unless the local
service uses another loopback port.

If the service is stopped, times out, returns no text, or the URL is invalid,
Gospeak returns an error. It never falls back to a cloud ASR Provider.
