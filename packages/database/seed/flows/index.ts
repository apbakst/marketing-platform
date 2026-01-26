/**
 * Sample Flow Configurations
 * 
 * These flows can be imported and seeded into the database
 * for quick setup of common marketing automation scenarios.
 */

import welcomeSeries from './welcome-series.json';
import abandonedCart from './abandoned-cart.json';
import reEngagement from './re-engagement.json';

export const sampleFlows = {
  welcomeSeries,
  abandonedCart,
  reEngagement,
};

export type SampleFlowKey = keyof typeof sampleFlows;

export const flowDescriptions: Record<SampleFlowKey, string> = {
  welcomeSeries: 'A 3-email welcome sequence for new subscribers over 7 days',
  abandonedCart: 'Multi-step flow to recover abandoned shopping carts with escalating incentives',
  reEngagement: 'Win back inactive subscribers who haven\'t engaged in 30+ days',
};

/**
 * Get a sample flow by key
 */
export function getSampleFlow(key: SampleFlowKey) {
  return sampleFlows[key];
}

/**
 * Get all sample flows
 */
export function getAllSampleFlows() {
  return Object.entries(sampleFlows).map(([key, flow]) => ({
    key: key as SampleFlowKey,
    flow,
    description: flowDescriptions[key as SampleFlowKey],
  }));
}

export default sampleFlows;
