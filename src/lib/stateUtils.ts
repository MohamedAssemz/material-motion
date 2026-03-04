// State transition rules and utilities
export const unitStates = [
  'waiting_for_rm',
  'in_manufacturing',
  'manufactured',
  'waiting_for_pm',
  'in_packaging',
  'packaged',
  'waiting_for_bm',
  'in_boxing',
  'boxed',
  'qced',
  'finished',
] as const;

export type UnitState = typeof unitStates[number];

export const stateDisplayNames: Record<UnitState, string> = {
  waiting_for_rm: 'Waiting for Raw Materials',
  in_manufacturing: 'In Manufacturing',
  manufactured: 'Manufactured',
  waiting_for_pm: 'Waiting for Packaging',
  in_packaging: 'In Packaging',
  packaged: 'Packaged',
  waiting_for_bm: 'Waiting for Boxing',
  in_boxing: 'In Boxing',
  boxed: 'Boxed',
  qced: 'QC Completed',
  finished: 'Finished',
};

export const stateColors: Record<UnitState, string> = {
  waiting_for_rm: 'bg-attention text-attention-foreground',
  in_manufacturing: 'bg-in-progress text-white',
  manufactured: 'bg-completed text-completed-foreground',
  waiting_for_pm: 'bg-attention text-attention-foreground',
  in_packaging: 'bg-in-progress text-white',
  packaged: 'bg-completed text-completed-foreground',
  waiting_for_bm: 'bg-attention text-attention-foreground',
  in_boxing: 'bg-in-progress text-white',
  boxed: 'bg-completed text-completed-foreground',
  qced: 'bg-completed text-completed-foreground',
  finished: 'bg-success text-success-foreground',
};

export const roleDisplayNames = {
  admin: 'Administrator',
  manufacturing_manager: 'Manufacturing Manager',
  finishing_manager: 'Finishing Manager',
  packaging_manager: 'Packaging Manager',
  boxing_manager: 'Boxing Manager',
} as const;

export type UserRole = keyof typeof roleDisplayNames;

// State transition permissions
export const stateTransitionPermissions: Record<UnitState, { nextStates: UnitState[]; roles: UserRole[] }> = {
  waiting_for_rm: {
    nextStates: ['in_manufacturing'],
    roles: ['manufacturing_manager', 'admin'],
  },
  in_manufacturing: {
    nextStates: ['manufactured'],
    roles: ['manufacturing_manager', 'admin'],
  },
  manufactured: {
    nextStates: ['waiting_for_pm', 'in_packaging'],
    roles: ['finishing_manager', 'admin'],
  },
  waiting_for_pm: {
    nextStates: ['in_packaging'],
    roles: ['packaging_manager', 'admin'],
  },
  in_packaging: {
    nextStates: ['packaged'],
    roles: ['packaging_manager', 'admin'],
  },
  packaged: {
    nextStates: ['waiting_for_bm', 'in_boxing'],
    roles: ['boxing_manager', 'admin'],
  },
  waiting_for_bm: {
    nextStates: ['in_boxing'],
    roles: ['boxing_manager', 'admin'],
  },
  in_boxing: {
    nextStates: ['boxed'],
    roles: ['boxing_manager', 'admin'],
  },
  boxed: {
    nextStates: ['qced'],
    roles: ['admin'],
  },
  qced: {
    nextStates: ['finished'],
    roles: ['admin'],
  },
  finished: {
    nextStates: [],
    roles: ['admin'],
  },
};

export function canTransitionToState(
  currentState: UnitState,
  targetState: UnitState,
  userRoles: string[]
): boolean {
  const permissions = stateTransitionPermissions[currentState];
  
  if (!permissions.nextStates.includes(targetState)) {
    return false;
  }

  return permissions.roles.some(role => 
    userRoles.includes(role) || userRoles.includes('admin')
  );
}

export function getNextStatesForUser(currentState: UnitState, userRoles: string[]): UnitState[] {
  const permissions = stateTransitionPermissions[currentState];
  
  if (!permissions) return [];
  
  const hasPermission = permissions.roles.some(role => 
    userRoles.includes(role) || userRoles.includes('admin')
  );
  
  return hasPermission ? permissions.nextStates : [];
}
