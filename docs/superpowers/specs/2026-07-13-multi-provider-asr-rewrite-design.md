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

The exact Settings interaction and layout are intentionally deferred to a
separate design discussion.

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
- `qwen-local` runs Qwen3-ASR 0.6B locally. Its first delivery supports complete
  WAV-file transcription only through a local `qwen-asr` sidecar. Installation,
  model-path selection, and process lifecycle UX remain to be designed.
- `qwen-api` uploads audio to the configured Qwen3-ASR 1.7B API.
- `doubao` uses its provider-specific batch ASR request and audio constraints.
- `openai-realtime` selects the existing streaming pipeline.

Provider selection is authoritative. A failed local transcription must never
fall back to a cloud provider automatically, because doing so would transmit
audio without an explicit user choice. Provider failures are returned to the
user with no cross-provider retry.

The remote Qwen adapter must follow the actual API documentation supplied for
the deployment. Its base URL, authentication, audio format, response schema,
and model identifier are not assumed to be OpenAI-compatible.

For Rewrite, keep the existing OpenAI adapter and add a DeepSeek adapter using
DeepSeek's supported Chat Completions request format. Both produce the same
internal rewritten-text result used by the rest of the pipeline.

## Streaming Boundary

The initial multi-provider delivery does not add Qwen or Doubao streaming.
Selecting `openai-realtime` explicitly selects the existing streaming path;
selecting another ASR provider uses its batch path. The future relationship
between this provider choice and the current Streaming control belongs to the
deferred Settings design.

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

- Settings information architecture and interaction details.
- A general third-party provider plugin system.
- Automatic model downloading or updating.
- Qwen or Doubao streaming in the first delivery.
- Automatic fallback between local and cloud providers.
- Beta release work.
