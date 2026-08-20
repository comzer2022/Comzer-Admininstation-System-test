const ROLE_DIPLOMAT = '1188429176739479562';
export type MemberGroup = 'diplomat' | 'citizen';
export function inferGroupFromRoles(roleIds: string[]): MemberGroup {
    if (roleIds.includes(ROLE_DIPLOMAT))
        return 'diplomat';
    return 'citizen';
}
