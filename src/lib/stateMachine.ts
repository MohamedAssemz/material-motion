// Unit state machine with allowed transitions (matching 9-state flow, pending_rm removed)
export type UnitState = 
  | 'in_manufacturing'     // 1. In Manufacturing
  | 'ready_for_finishing'  // 2. Ready for Finishing
  | 'in_finishing'         // 3. In Finishing
  | 'ready_for_packaging'  // 4. Ready for Packaging
  | 'in_packaging'         // 5. In Packaging
  | 'ready_for_boxing'     // 6. Ready for Boxing
  | 'in_boxing'            // 7. In Boxing
  | 'ready_for_shipment'   // 8. Ready for Shipment
  | 'shipped';             // 9. Shipped

// Human-readable labels for each state
const stateLabels: Record<string, string> = {
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
const inBoxStates: UnitState[] = ['in_manufacturing', 'in_finishing', 'in_packaging', 'in_boxing'];

// States where items need to be assigned TO a box
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

export function needsBoxOnTransition(targetState: UnitState): boolean {
  return needsBoxAssignment.includes(targetState);
}

export function isInBoxState(state: UnitState): boolean {
  return inBoxStates.includes(state);
}

export function isReadyForState(state: UnitState): boolean {
  return state.startsWith('ready_for_');
}

export function isInState(state: UnitState): boolean {
  return state.startsWith('in_');
}

// Get state color for UI
export function getStateColor(state: string): string {
  const colors: Record<string, string> = {
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
