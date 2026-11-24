/** #67 U43: the node groups that come with Saga Forge (read-only; a mod gets a copy when it places one). */
import type { NodeGroupDef } from '../nodegroups'
import fleetResponse from './fleet_response.group.json'

export const BUILTIN_GROUPS: NodeGroupDef[] = [fleetResponse as unknown as NodeGroupDef]
