// Unit state machine with allowed transitions (matching new 10-state flow)
export type UnitState = 
  | 'pending_rm'           // 1. Pending RM
  | 'in_manufacturing'     // 2. In Manufacturing
  | 'ready_for_finishing'  // 3. Ready for Finishing
  | 'in_finishing'         // 4. In Finishing
  | 'ready_for_packaging'  // 5. Ready for Packaging
  | 'in_packaging'         // 6. In Packaging
  | 'ready_for_boxing'     // 7. Ready for Boxing
  | 'in_boxing'            // 8. In Boxing
  | 'ready_for_shipment'   // 9. Ready for Shipment
  | 'shipped';             // 10. Shipped

// Human-readable labels for each state
const stateLabels: Record<string, string> = {
  'pending_rm': 'Pending RM',
  'in_manufacturing': 'In Manufacturing',
  'ready_for_finishing': 'Ready for Finishing',
  'in_finishing': 'In Finishing',
  'ready_for_packaging': 'Ready for Packaging',
  'in_packaging': 'In Packaging',
  'ready_for_boxing': 'Ready for Boxing',
  'in_boxing': 'In Boxing',
  'ready_for_shipment': 'Ready for Shipment',
  'shipped': 'Shipped',
  // Origin states for extra inventory
  'extra_manufacturing': 'Extra Manufacturing',
  'extra_finishing': 'Extra Finishing',
  'extra_packaging': 'Extra Packaging',
  'extra_boxing': 'Extra Boxing',
};

// Define the next state for each current state
const stateTransitions: Record<UnitState, UnitState | null> = {
  'pending_rm': 'in_manufacturing',
  'in_manufacturing': 'ready_for_finishing',
  'ready_for_finishing': 'in_finishing',
  'in_finishing': 'ready_for_packaging',
  'ready_for_packaging': 'in_packaging',
  'in_packaging': 'ready_for_boxing',
  'ready_for_boxing': 'in_boxing',
  'in_boxing': 'ready_for_shipment',
  'ready_for_shipment': 'shipped',
  'shipped': null, // No next state
};

// States that require lead time input when transitioning TO them
const requiresLeadTime: UnitState[] = ['in_manufacturing', 'in_finishing', 'in_packaging', 'in_boxing'];

// States where items are IN a box (the "In" states)
// When transitioning FROM these states, items leave the box
const inBoxStates: UnitState[] = ['in_manufacturing', 'in_finishing', 'in_packaging', 'in_boxing'];

// States where items need to be assigned TO a box (the "Ready for" states after "In" states)
// When transitioning TO these states, items need box assignment
// Note: ready_for_shipment does NOT need box assignment (items go directly to kartona)
const needsBoxAssignment: UnitState[] = ['ready_for_finishing', 'ready_for_packaging', 'ready_for_boxing'];

// "In" states where scanning/selecting box is needed to receive items
const receivingStates: UnitState[] = ['in_manufacturing', 'in_finishing', 'in_packaging', 'in_boxing'];

export function getNextState(currentState: UnitState): UnitState | null {
  return stateTransitions[currentState];
}

export function requiresLeadTimeInput(state: UnitState): boolean {
  return requiresLeadTime.includes(state);
}

export function getStateLabel(state: UnitState | string): string {
  return stateLabels[state as UnitState] || state.replace(/_/g, ' ').toUpperCase();
}

export function canTransitionTo(currentState: UnitState, targetState: UnitState): boolean {
  return stateTransitions[currentState] === targetState;
}

// Check if transitioning to this state requires box assignment
export function needsBoxOnTransition(targetState: UnitState): boolean {
  return needsBoxAssignment.includes(targetState);
}

// Check if current state means items are in a box (for receiving workflow)
export function isInBoxState(state: UnitState): boolean {
  return inBoxStates.includes(state);
}

// Check if this is a "Ready for" state (items waiting to be received)
export function isReadyForState(state: UnitState): boolean {
  return state.startsWith('ready_for_');
}

// Check if this is an "In" state (items being processed)
export function isInState(state: UnitState): boolean {
  return state.startsWith('in_');
}

// Get state color for UI
export function getStateColor(state: string): string {
  const colors: Record<string, string> = {
    'pending_rm': 'bg-yellow-500',
    'in_manufacturing': 'bg-blue-500',
    'ready_for_finishing': 'bg-blue-300',
    'in_finishing': 'bg-purple-500',
    'ready_for_packaging': 'bg-orange-500',
    'in_packaging': 'bg-indigo-500',
    'ready_for_boxing': 'bg-cyan-300',
    'in_boxing': 'bg-cyan-500',
    'ready_for_shipment': 'bg-teal-300',
    'shipped': 'bg-green-500',
    // Origin states for extra inventory
    'extra_manufacturing': 'bg-amber-500',
    'extra_finishing': 'bg-amber-400',
    'extra_packaging': 'bg-amber-300',
    'extra_boxing': 'bg-amber-200',
  };
  return colors[state] || 'bg-gray-500';
}

// Get all states in order
export function getAllStates(): UnitState[] {
  return [
    'pending_rm',
    'in_manufacturing',
    'ready_for_finishing',
    'in_finishing',
    'ready_for_packaging',
    'in_packaging',
    'ready_for_boxing',
    'in_boxing',
    'ready_for_shipment',
    'shipped',
  ];
}
