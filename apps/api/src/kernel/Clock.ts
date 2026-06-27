/** Clock port - inject so domain/handlers stay deterministic and testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
