export interface TrainingSet {
  id: string
  exercise_name: string
  date: string
  weight: number
  reps_arr: number[]
  rest_note: string | null
  set_note: string | null
  created_at: string
}

export interface TrainingNote {
  id: string
  date: string
  note: string | null
}