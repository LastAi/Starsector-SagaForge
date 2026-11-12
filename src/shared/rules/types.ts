/** One rules.csv row as read from a file (text kept exactly; parsing is done by rules/parse.ts). */
export interface RuleRow {
  id: string
  trigger: string
  conditions: string
  script: string
  text: string
  options: string
  notes: string
  /** Source (mod) id, 'starsector-core' for vanilla, or 'plan' for rows exported from a plan. */
  sourceId: string
  file: string
  /** 1-based line of the row in the file. */
  line: number
}
