import type { Entity, WorldState } from "./types";

export type TutorialStep = {
  id: string;
  label: string;
  description: string;
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
  const selectedWorkerComplete = selectedWorker || workerGatheringFood || hasDormitory || hasBarracks || militiaQueuedOrFielded;
  const gatherFoodComplete = workerGatheringFood || hasDormitory || hasBarracks || militiaQueuedOrFielded;
  const dormitoryComplete = hasDormitory || hasBarracks || militiaQueuedOrFielded;
  const barracksComplete = hasBarracks || militiaQueuedOrFielded;

  const steps: TutorialStep[] = [
    {
      id: "select-worker",
      label: "Select a Worker",
      description: "Left click a worker to open economic and build commands.",
      completed: selectedWorkerComplete,
    },
    {
      id: "gather-food",
      label: "Order Food Gathering",
      description: "Right click a food patch or use the Gather command card.",
      completed: gatherFoodComplete,
    },
    {
      id: "build-dormitory",
      label: "Build a Dormitory",
      description: "Use a worker to place a dormitory and expand population room.",
      completed: dormitoryComplete,
    },
    {
      id: "build-barracks",
      label: "Build a Barracks",
      description: "Establish your first military building.",
      completed: barracksComplete,
    },
    {
      id: "train-militia",
      label: "Train a Militia",
      description: "Queue or field a militia to complete the opening drill.",
      completed: militiaQueuedOrFielded,
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
