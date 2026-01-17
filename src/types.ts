export type Confidence = 'high' | 'medium' | 'low';

export type ResumeMode = 'resume' | 'launch';

export type ResumeCommand = {
  command: string;
  args: string[];
  mode: ResumeMode;
};

export type ToolEvent = {
  id: string;
  label: string;
  occurredAt: Date;
  source: string;
  confidence: Confidence;
  summary?: string;
  resume?: ResumeCommand | null;
};

export type ToolProvider = {
  id: string;
  label: string;
  fetchEvents: (limit?: number) => Promise<ToolEvent[]>;
};

export type ScanResult = {
  events: ToolEvent[];
  latest: ToolEvent | null;
};
