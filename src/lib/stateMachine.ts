// Unit state machine with allowed transitions
export type UnitState = 
  | 'waiting_for_rm'
  | 'manufacturing'
  | 'waiting_for_packaging_material'
  | 'packaging'
  | 'waiting_for_boxing_material'
  | 'boxing'
  | 'waiting_for_receiving'
  | 'received'
  | 'finished';

// Define the next state for each current state
const stateTransitions: Record<UnitState, UnitState | null> = {
  'waiting_for_rm': 'manufacturing',
  'manufacturing': 'waiting_for_packaging_material',
  'waiting_for_packaging_material': 'packaging',
  'packaging': 'waiting_for_boxing_material',
  'waiting_for_boxing_material': 'boxing',
  'boxing': 'waiting_for_receiving',
  'waiting_for_receiving': 'received',
  'received': 'finished',
  'finished': null, // No next state
};

// States that require lead time input when transitioning TO them
const requiresLeadTime: UnitState[] = ['manufacturing', 'packaging', 'boxing'];

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
