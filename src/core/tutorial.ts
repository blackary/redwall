import type { Entity, WorldState } from "./types";

export type TutorialStep = {
  id: string;
  label: string;
  description: string;
  why: string;
  how: string;
  success: string;
  completed: boolean;
};

export type TutorialState = {
  completed: boolean;
  currentStepIndex: number;
  currentStep?: TutorialStep;
  steps: TutorialStep[];
};

export function getTutorialState(world: WorldState, selected: Entity[]): TutorialState | undefined {
  if (world.scenario !== "tutorial") {
    return undefined;
  }

  const playerEntities = Object.values(world.entities).filter((entity) => entity.kind !== "resource" && entity.playerId === "player");
  const playerWorkers = playerEntities.filter((entity) => entity.kind === "unit" && entity.unitType === "worker");
  const abbeyHall = playerEntities.find((entity) => entity.kind === "building" && entity.buildingType === "abbeyHall");
  const selectedWorker = selected.some((entity) => entity.kind === "unit" && entity.unitType === "worker");
  const workerGatheringFood = playerEntities.some((entity) => {
    if (entity.kind !== "unit" || entity.unitType !== "worker") {
      return false;
    }
    if (entity.carry?.type === "food" && entity.carry.amount > 0) {
      return true;
    }
    if (entity.order.type !== "gather") {
      return false;
    }
    const target = world.entities[entity.order.targetId];
    return target?.kind === "resource" && target.resourceType === "food";
  });
  const hasDormitory = playerEntities.some((entity) => entity.kind === "building" && entity.buildingType === "dormitory");
  const workerQueuedOrFielded = playerWorkers.length > 4
    || (abbeyHall?.kind === "building" && abbeyHall.queue.some((item) => item.kind === "unit" && item.id === "worker"));
  const hasBarracks = playerEntities.some((entity) => entity.kind === "building" && entity.buildingType === "barracks");
  const militiaQueuedOrFielded = playerEntities.some((entity) => {
    if (entity.kind === "unit") {
      return entity.unitType === "militia";
    }
    if (entity.kind === "building" && entity.buildingType === "barracks") {
      return entity.queue.some((item) => item.kind === "unit" && item.id === "militia");
    }
    return false;
  });
  const militiaIssuedAttack = playerEntities.some((entity) => {
    if (entity.kind !== "unit" || entity.unitType !== "militia") {
      return false;
    }
    return entity.order.type === "attack" || entity.order.type === "attackMove";
  });
  const selectedWorkerComplete = selectedWorker
    || workerGatheringFood
    || hasDormitory
    || workerQueuedOrFielded
    || hasBarracks
    || militiaQueuedOrFielded
    || militiaIssuedAttack;

  const steps: TutorialStep[] = [
    {
      id: "select-worker",
      label: "Select a Worker",
      description: "Workers are your economy, builders, and early emergency militia.",
      why: "You need a selected worker to open the tasking and construction cards that drive the whole early game.",
      how: "Left click one of the mice beside the Abbey Hall. If clicks feel crowded, drag a small box around one worker.",
      success: "A worker portrait appears and the Command Palette shows Tasking plus Construction.",
      completed: selectedWorkerComplete,
    },
    {
      id: "gather-food",
      label: "Order Food Gathering",
      description: "Food keeps workers, militia, and age-ups moving.",
      why: "A working food line is the safest first economic action because it fuels both economy and military production.",
      how: "Use Forage from the palette or right click a berry patch near the Abbey Hall.",
      success: "A worker is gathering or carrying food from a food node.",
      completed: workerGatheringFood,
    },
    {
      id: "build-dormitory",
      label: "Build a Dormitory",
      description: "Population space prevents training from stalling out.",
      why: "Dormitories increase your cap so the Abbey can keep adding workers and troops without getting blocked.",
      how: "Select a worker, click Dormitory in Construction, then place it on open ground near your hall.",
      success: "A completed Dormitory is standing in your base.",
      completed: hasDormitory,
    },
    {
      id: "train-worker",
      label: "Queue Another Worker",
      description: "Keep your economy growing while your first buildings go up.",
      why: "A steady worker count is the backbone of every strong RTS opening.",
      how: "Select the Abbey Hall and queue a Worker from the Training section.",
      success: "A worker is queued at the Abbey Hall or an extra worker has spawned.",
      completed: workerQueuedOrFielded,
    },
    {
      id: "build-barracks",
      label: "Build a Barracks",
      description: "This is your first real military production building.",
      why: "The Barracks opens Militia so you can defend gathers and start pressure.",
      how: "Use a worker to place a Barracks on a clear 2x1 footprint.",
      success: "A completed Barracks is standing in your base.",
      completed: hasBarracks,
    },
    {
      id: "train-militia",
      label: "Train a Militia",
      description: "Militia are your first frontline unit and the transition from eco to combat.",
      why: "Training a military unit is the moment your opening can contest raids and threaten the enemy.",
      how: "Select the Barracks and queue a Militia.",
      success: "A militia is in the queue or on the field.",
      completed: militiaQueuedOrFielded,
    },
    {
      id: "issue-attack",
      label: "Issue an Attack Order",
      description: "Use your new militia to practice direct combat control.",
      why: "The tutorial should leave you knowing how to send troops into a fight, not just how to build them.",
      how: "Select the Militia, arm Attack, then click an enemy or open ground toward the vermin camp.",
      success: "A militia has an Attack or Attack-Move order.",
      completed: militiaIssuedAttack,
    },
  ];

  const currentStepIndex = steps.findIndex((step) => !step.completed);
  return {
    completed: currentStepIndex === -1,
    currentStepIndex: currentStepIndex === -1 ? steps.length - 1 : currentStepIndex,
    currentStep: currentStepIndex === -1 ? undefined : steps[currentStepIndex],
    steps,
  };
}
