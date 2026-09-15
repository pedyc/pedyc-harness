/** One executed verification gate and its outcome. */
export interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'
  details: string
}
