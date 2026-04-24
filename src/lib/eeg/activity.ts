import type { EEGRecording } from "./types";

export interface ChannelActivity {
  channelIdx: number;
  label: string;
  activity: number;
}

interface ChannelStats {
  peakAbs: number;
  meanAbs: number;
}

export function computeChannelActivities(recording: EEGRecording, currentTime: number): ChannelActivity[] {
  const stats = getChannelStats(recording);
  const center = Math.max(0, Math.floor(currentTime * recording.sampleRate));
  const energyWindow = Math.max(2, Math.floor(recording.sampleRate * 0.05));
  const neighborhoodWindow = Math.max(3, Math.floor(recording.sampleRate * 0.12));

  return recording.channels.map((channel, channelIdx) => {
    const lastSample = Math.max(0, channel.data.length - 1);
    const clampedCenter = Math.min(center, lastSample);
    const from = Math.max(0, clampedCenter - neighborhoodWindow);
    const to = Math.min(channel.data.length, clampedCenter + neighborhoodWindow + 1);
    const localFrom = Math.max(0, clampedCenter - energyWindow);
    const localTo = Math.min(channel.data.length, clampedCenter + energyWindow + 1);

    let instantaneous = 0;
    let localPeak = 0;
    let localAbsSum = 0;
    let localSamples = 0;

    for (let i = from; i < to; i++) {
      const value = Math.abs(channel.data[i]);
      if (i === clampedCenter) instantaneous = value;
      if (value > localPeak) localPeak = value;

      if (i >= localFrom && i < localTo) {
        localAbsSum += value;
        localSamples += 1;
      }
    }

    const channelStats = stats[channelIdx];
    const localMean = localAbsSum / Math.max(1, localSamples);
    const instantRatio = instantaneous / channelStats.peakAbs;
    const peakRatio = localPeak / channelStats.peakAbs;
    const meanRatio = localMean / Math.max(channelStats.meanAbs, 1);
    const energy = instantRatio * 0.65 + peakRatio * 0.25 + Math.min(1.5, meanRatio) * 0.2;

    return {
      channelIdx,
      label: channel.label,
      activity: clamp01(energy * 1.35),
    };
  });
}

export function summarizeActivity(activities: ChannelActivity[]) {
  const globalActivity = activities.length
    ? activities.reduce((sum, channel) => sum + channel.activity, 0) / activities.length
    : 0;
  const peakActivity = activities.reduce((peak, channel) => Math.max(peak, channel.activity), 0);
  const topChannels = [...activities].sort((a, b) => b.activity - a.activity).slice(0, 5);

  return { globalActivity, peakActivity, topChannels };
}

function getChannelStats(recording: EEGRecording): ChannelStats[] {
  return recording.channels.map((channel) => {
    let peakAbs = 1;
    let totalAbs = 0;

    for (let i = 0; i < channel.data.length; i++) {
      const value = Math.abs(channel.data[i]);
      if (value > peakAbs) peakAbs = value;
      totalAbs += value;
    }

    return {
      peakAbs,
      meanAbs: totalAbs / Math.max(1, channel.data.length),
    };
  });
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
