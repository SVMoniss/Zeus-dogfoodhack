export type UserRole = 'visitor' | 'participant' | 'judge' | 'organizer' | 'admin';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  submissions_open_at: string;
  submissions_close_at: string;
  voting_open_at: string | null;
  voting_close_at: string | null;
  results_published_at: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  display_order: number;
}

export interface Team {
  id: string;
  event_id: string;
  name: string;
  invite_code: string;
  max_members: number;
  created_by: string;
  created_at: string;
  member_count?: number;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  joined_at: string;
}

export interface Project {
  id: string;
  event_id: string;
  team_id: string;
  track_id: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  repo_url: string | null;
  demo_url: string | null;
  video_url: string | null;
  submitted_at: string | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  team_name?: string;
  track_name?: string;
}

export interface ProjectListItem {
  id: string;
  title: string;
  summary: string | null;
  repo_url: string | null;
  demo_url: string | null;
  video_url: string | null;
  submitted_at: string | null;
  is_draft: boolean;
  team_name: string;
  track_name: string;
}

export interface JudgingCriteria {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  weight: number;
  min_score: number;
  max_score: number;
  display_order: number;
}

export interface JudgeAssignment {
  id: string;
  event_id: string;
  judge_id: string;
  track_id: string;
  judge_name?: string;
  judge_email?: string;
  track_name?: string;
}

export interface Score {
  id: string;
  event_id: string;
  judge_id: string;
  project_id: string;
  criteria_id: string;
  score: number;
  comment: string | null;
  submitted_at: string;
}

export interface ProgressDashboard {
  total_projects: number;
  judged_projects: number;
  pending_projects: number;
  total_judges: number;
  judges_completed: number;
  by_track: Record<string, { total: number; judged: number; pending: number }>;
  by_judge: Record<string, { name: string; track: string; total: number; completed: number }>;
}

export interface NormalizationReport {
  judge_id: string;
  judge_name: string;
  raw_scores: Record<string, number[]>;
  mean: number;
  std: number;
  normalized_scores: Record<string, number>;
}