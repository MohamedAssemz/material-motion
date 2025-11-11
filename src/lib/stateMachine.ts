// Unit state machine with allowed transitions (matching database enum)
export type UnitState = 
  | 'waiting_for_rm'
  | 'in_manufacturing'
  | 'manufactured'
  | 'waiting_for_packaging_material'
  | 'in_packaging'
  | 'packaged'
  | 'waiting_for_boxing_material'
  | 'in_boxing'
  | 'boxed'
  | 'waiting_for_receiving'
  | 'received'
  | 'finished';

// Define the next state for each current state
const stateTransitions: Record<UnitState, UnitState | null> = {
  'waiting_for_rm': 'in_manufacturing',
  'in_manufacturing': 'manufactured',
  'manufactured': 'waiting_for_packaging_material',
  'waiting_for_packaging_material': 'in_packaging',
  'in_packaging': 'packaged',
  'packaged': 'waiting_for_boxing_material',
  'waiting_for_boxing_material': 'in_boxing',
  'in_boxing': 'boxed',
  'boxed': 'waiting_for_receiving',
  'waiting_for_receiving': 'received',
  'received': 'finished',
  'finished': null, // No next state
};

// States that require lead time input when transitioning TO them
const requiresLeadTime: UnitState[] = ['in_manufacturing', 'in_packaging', 'in_boxing'];

export function getNextState(currentState: UnitState): UnitState | null {
  return stateTransitions[currentState];
}

export function requiresLeadTimeInput(state: UnitState): boolean {
  return requiresLeadTime.includes(state);
}

export function getStateLabel(state: UnitState): string {
  return state.replace(/_/g, ' ').toUpperCase();
}

export function canTransitionTo(currentState: UnitState, targetState: UnitState): boolean {
  return stateTransitions[currentState] === targetState;
}
