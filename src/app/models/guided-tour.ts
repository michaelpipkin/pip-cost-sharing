export type GuidedTourPlacement = 'bottom' | 'top' | 'right' | 'left';

export type GuidedTourEndReason = 'completed' | 'closed';

export interface GuidedTourStep {
  id: string;
  title: string;
  text: string;
  /**
   * `data-tour-anchor` names of the element(s) to spotlight; the callout is
   * anchored to the union of their bounding boxes. Omit for a centered step
   * with no spotlight.
   */
  target?: string | string[];
  /** Preferred side for the callout; falls back automatically when it won't fit. */
  placement?: GuidedTourPlacement;
  /** Puts the page into the state this step explains (e.g. switch a toggle). */
  beforeShow?: () => void | Promise<void>;
  /** The step is skipped when this returns false. */
  when?: () => boolean;
}

export interface GuidedTourConfig {
  /** Identifies the tour in analytics. */
  id: string;
  steps: GuidedTourStep[];
  /** Always called exactly once when the tour ends, however it ends. */
  onEnd?: (reason: GuidedTourEndReason) => void;
  /** When set, the last step offers a "Read full help" button that calls it. */
  fullHelp?: () => void;
}
