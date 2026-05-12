export interface TrainingSet {
  id: string
  exercise_name: string
  date: string
  weight: number | null
  reps_arr: number[]
  set_type: 'weighted' | 'bw' | 'timed' | 'wt'
  bw_reps: number | null
  timed_seconds: number[] | null
  rest_note: string | null
  set_note: string | null
  created_at: string
  wt_seconds: number | null
}

export interface TrainingNote {
  id: string
  date: string
  note: string | null
}