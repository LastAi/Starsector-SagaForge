/**
 * #79: one-name characters (shared/personname.ts). A line that names a one-name person by first
 * name shows their one name in game only with SagaLib 1.4 (vanilla fills $personFirstName with the
 * empty first name), and may read oddly ("Tyger Tyger"): a warning per dialog node, so the writer
 * checks the wording. Also a one-name person's generated $<id>_firstName token, which is the one name.
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { firstNameUses } from '../personname'

export function oneNameProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  for (const u of firstNameUses(ctx.model, ctx.index?.people ?? [])) {
    if (u.kind === 'token') out.push({
      level: 'warning', area: 'Quest', ref: u.ref, key: `onenametoken:${u.key}`,
      message: `${u.where} uses $${u.person}_firstName, but ${u.one} has one name: the token is "${u.one}" (Saga Forge exports it so, SagaLib 1.4 falls back to it). Check the line still reads right, or use $${u.person}_name.`
    })
    else out.push({
      level: 'warning', area: 'Quest', ref: u.ref, key: `onenamefirst:${u.key}`,
      message: `${u.where} uses ${u.tokens.join(' / ')}, and ${u.one} (who the dialog is with) has one name: in game it says "${u.one}" with SagaLib 1.4 (vanilla alone leaves it empty, "Hi, ."). Check the line still reads right with the one name, or use $personName.`
    })
  }
  return out
}
