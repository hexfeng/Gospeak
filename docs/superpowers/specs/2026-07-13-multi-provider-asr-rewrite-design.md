# Multi-Provider ASR And Rewrite Design

## Goal

Extend Gospeak from its fixed Groq STT and OpenAI Rewrite pairing to an explicit,
small provider matrix. Preserve the existing OpenAI Realtime path as a cloud ASR
provider while adding local Qwen ASR, remote Qwen ASR, Doubao ASR, and DeepSeek
Rewrite.

## Provider Matrix

ASR providers:

| Mode | Provider id | Model |
| --- | --- | --- |
| Local | `qwen-local` | Qwen3-ASR 0.6B |
| Cloud | `groq` | Existing Whisper models |
| Cloud | `qwen-api` | Qwen3-ASR 1.7B through a remote API |
| Cloud | `doubao` | Doubao ASR |
| Cloud | `openai-realtime` | Existing OpenAI Realtime model |

Rewrite providers:

| Provider id | Models |
| --- | --- |
| `openai` | Existing OpenAI models |
| `deepseek` | `deepseek-v4-flash`, `deepseek-v4-pro` |

Settings uses the minimum provider, model, conditional Qwen Base URL, and
deduplicated credential controls. It does not add health monitoring, downloads,
or advanced provider parameters.

## Configuration Model

Use separate provider types for ASR and Rewrite so invalid combinations cannot
be represented. Persist the selected provider and model for each capability.

Do not persist a separate Local/Cloud ASR mode. The mode is derived from the ASR
provider: `qwen-local` is Local and every other accepted ASR provider is Cloud.
The Settings UI may present Local and Cloud as groups without creating another
source of state.

Cloud credentials remain provider-specific secrets in the OS keyring. Public
configuration such as a remote Qwen base URL may remain in application config.
Local Qwen configuration does not require an API key.

## Runtime Routing

Reuse the existing Rust `SttProvider` boundary and add one adapter per new ASR
provider. Keep explicit provider matching; do not introduce a dynamic plugin
registry or a universal compatibility adapter.

- `groq` keeps the current audio-file transcription path.
- `qwen-local` uploads complete WAV files to a user-managed loopback
  `/v1/audio/transcriptions` service using `Qwen/Qwen3-ASR-0.6B`.
- `qwen-api` uploads complete WAV files to a configured HTTPS
  `/v1/audio/transcriptions` endpoint using `Qwen/Qwen3-ASR-1.7B`; Bearer
  authentication is optional.
- `doubao` uses the Flash recording-file API with a single `X-Api-Key`, fixed
  `volc.bigasr.auc_turbo` resource, and `bigmodel` model.
- `openai-realtime` selects the existing streaming pipeline.

Provider selection is authoritative. A failed local transcription must never
fall back to a cloud provider automatically, because doing so would transmit
audio without an explicit user choice. Provider failures are returned to the
user with no cross-provider retry.

For Rewrite, keep the existing OpenAI adapter and add a DeepSeek adapter using
DeepSeek's Chat Completions request format. Flash disables Thinking and Pro
enables Thinking. Batch and streaming parsing use only `content` and ignore
`reasoning_content`.

## Streaming Boundary

The initial multi-provider delivery does not add Qwen or Doubao streaming.
Selecting `openai-realtime` explicitly selects the existing streaming path;
selecting another ASR provider uses its batch path. There is no separate
Streaming control. A legacy enabled flag migrates once to `openai-realtime`;
Provider selection is then the only runtime source of truth.

## Usage And Cost

Usage events continue to record the selected provider and model. Do not invent
cost estimates for providers without a verified price. Local Qwen records zero
external API cost; this does not attempt to estimate local hardware or power
cost.

## Delivery Order

1. Close current functionality: resolve the three non-functional privacy
   controls and complete current-head manual acceptance.
2. Separate ASR and Rewrite provider configuration and routing.
3. Add DeepSeek V4 Flash and Pro Rewrite.
4. Add local Qwen3-ASR 0.6B batch transcription.
5. Add the remote Qwen3-ASR 1.7B API.
6. Add Doubao batch ASR.
7. Design additional provider-specific streaming only when required.

Each provider slice must leave existing providers working and include one
provider-routing check plus adapter request/response tests. Full repository
verification remains required before a slice is considered complete.

## Out Of Scope

- Settings information-architecture redesign beyond the minimum selectors.
- A general third-party provider plugin system.
- Automatic model downloading or updating.
- Qwen or Doubao streaming in the first delivery.
- Automatic fallback between local and cloud providers.
- Beta release work.
