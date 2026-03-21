type WidgetSnapshot = {
  daysToRace: string;
  isRaceWeek: boolean;
  lastCoachMessage: string;
  plannedWorkout: string;
  trainingStatus: string;
  workoutDistance: string;
};

let widgetsUnavailableLogged = false;

function loadWidgetModules() {
  try {
    const quickView = require('../../widgets/PeiPeiQuickView').default as {
      updateSnapshot: (props: {
        daysToRace: string;
        lastCoachMessage: string;
        plannedWorkout: string;
        workoutDistance: string;
      }) => void;
    };
    const raceWeekActivity = require('../../widgets/PeiPeiRaceWeekActivity')
      .default as {
      getInstances: () => Array<{
        end: (dismissalPolicy?: 'default' | 'immediate') => Promise<void>;
        update: (props: {
          daysToRace: string;
          headline: string;
          trainingStatus: string;
        }) => Promise<void>;
      }>;
      start: (
        props: {
          daysToRace: string;
          headline: string;
          trainingStatus: string;
        },
        url?: string,
      ) => {
        update: (props: {
          daysToRace: string;
          headline: string;
          trainingStatus: string;
        }) => Promise<void>;
      };
    };

    return {
      quickView,
      raceWeekActivity,
    };
  } catch (error) {
    if (!widgetsUnavailableLogged) {
      console.log('[widgets unavailable in current runtime]', error);
      widgetsUnavailableLogged = true;
    }

    return null;
  }
}

export async function syncPeiPeiWidgets(snapshot: WidgetSnapshot) {
  const widgetModules = loadWidgetModules();

  if (!widgetModules) {
    return;
  }

  widgetModules.quickView.updateSnapshot({
    daysToRace: snapshot.daysToRace,
    lastCoachMessage: snapshot.lastCoachMessage,
    plannedWorkout: snapshot.plannedWorkout,
    workoutDistance: snapshot.workoutDistance,
  });

  const liveActivityProps = {
    daysToRace: snapshot.daysToRace,
    headline: snapshot.lastCoachMessage,
    trainingStatus: snapshot.trainingStatus,
  };
  const liveActivities = widgetModules.raceWeekActivity.getInstances();

  if (snapshot.isRaceWeek) {
    if (liveActivities.length === 0) {
      widgetModules.raceWeekActivity.start(liveActivityProps, 'peipei:///');
      return;
    }

    await Promise.all(
      liveActivities.map((activity) => activity.update(liveActivityProps)),
    );
    return;
  }

  await Promise.all(liveActivities.map((activity) => activity.end('default')));
}
