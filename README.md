# Neural Pulse Play

Neural Pulse Play is a browser-based neurotechnology sandbox with two connected workspaces:

- `EEG Review`: inspect uploaded or demo EEG data with band selection, montage/reference controls, waveform playback, artifact-aware review, and a 3D topographic brain/head view.
- `DBS Sandbox`: experiment with a simplified basal ganglia loop, place a stimulation electrode, tune pulse parameters, and watch the network stabilise or destabilise in real time.

It is designed as a science-heavy portfolio project that still feels interactive and demo-friendly.

## Product framing

This project is moving beyond a simple EEG visualiser. The current product direction is:

- a clinical-style EEG review surface for playback and topographic exploration
- a neurostimulation playground inspired by DBS control loops
- a foundation for future stress, routing, and cognitive gameplay modes

## Current features

### EEG Review

- Demo EEG datasets covering alpha, beta, theta, and spike-heavy activity
- File and URL loading for EDF/BDF, CSV, and TSV inputs
- Playback controls with scrubbing and speed control
- Band modes:
  `full`, `delta`, `theta`, `alpha`, `beta`, `gamma`
- Reference modes:
  `raw`, `average`
- Montage modes:
  `referential`, `bipolar`
- Adjustable smoothing and artifact threshold
- Waveform review canvas with artifact-highlighted channels
- 3D headset and cortical map views
- Adjustable topography gain, spread, and cortical inset
- Review metrics for synchrony, entropy, dominant band, artifact count, and global activity

### DBS Sandbox

- Basal Ganglia Loop preset
- Selectable stimulation electrode
- Adjustable pulse amplitude
- Adjustable pulse frequency
- Adjustable pulse width
- Adjustable affected radius
- `tremor noise` and `stabilized` sandbox modes
- HUD for firing rate, synchrony, tremor index, stimulation dose, and network entropy

## Architecture

Key modules:

- [`src/lib/eeg/review.ts`](./src/lib/eeg/review.ts): review pipeline for filtering, montage, reference, smoothing, and artifact scoring
- [`src/lib/eeg/activity.ts`](./src/lib/eeg/activity.ts): activity extraction for topographic mapping
- [`src/components/eeg/Brain3D.tsx`](./src/components/eeg/Brain3D.tsx): procedural cortex/head visualisation and heat-map rendering
- [`src/lib/simulation/engine.ts`](./src/lib/simulation/engine.ts): DBS simulation engine and metrics
- [`src/components/dbs/DBSSandbox.tsx`](./src/components/dbs/DBSSandbox.tsx): sandbox UI for neurostimulation experiments

## Getting started

### Requirements

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Data direction

The project is intentionally built around datasets that are common in EEG and BCI demos, including:

- motor imagery / BCI tasks
- P300 paradigms
- sleep EEG
- epileptic vs control EEG
- VEP and picture recognition tasks

Right now the app ships with synthetic demos and basic ingest support. The next step is expanding the import path and demo library with more real-world reviewed data.

## Recommended roadmap

Near-term priorities:

- richer artifact classification and channel quality scoring
- saved review presets and shareable session exports
- exportable stimulation and network states
- game modes built on the DBS simulation layer

## Notes

- The EEG review filters are lightweight browser-friendly approximations intended for interactive visualization, not clinical diagnosis.
- The DBS sandbox is conceptual and educational. It is not a biomedical simulator and should not be interpreted as treatment guidance.
