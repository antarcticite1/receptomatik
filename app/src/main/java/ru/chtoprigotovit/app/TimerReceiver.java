package ru.chtoprigotovit.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

public class TimerReceiver extends BroadcastReceiver {

    static final String ACTION_FIRE = "ru.chtoprigotovit.app.TIMER_FIRE";
    static final String ACTION_STOP = "ru.chtoprigotovit.app.TIMER_STOP";
    private static final String CH_RUNNING = "timer_running";
    private static final String CH_DONE = "timer_done_alarm";
    private static final int NOTIFICATION_ID = 7;
    private static final String PREFS = "timer";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            cancel(context);
        } else if (ACTION_FIRE.equals(action)) {
            String label = prefs(context).getString("label", "");
            showDone(context, label);
        }
    }

    static void schedule(Context context, long endAt, String label) {
        prefs(context).edit().putLong("end", endAt).putString("label", label).apply();
        ensureChannels(context);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent fire = broadcast(context, ACTION_FIRE, 1);
        if (am != null) {
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exact) {
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(endAt, openApp(context)), fire);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, fire);
            }
        }
        showRunning(context, endAt, label);
    }

    static void cancel(Context context) {
        prefs(context).edit().putLong("end", 0).apply();
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(broadcast(context, ACTION_FIRE, 1));
        }
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID);
        }
    }

    static long end(Context context) {
        return prefs(context).getLong("end", 0);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static PendingIntent broadcast(Context context, String action, int code) {
        Intent i = new Intent(context, TimerReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent openApp(Context context) {
        Intent i = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void ensureChannels(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel running = new NotificationChannel(CH_RUNNING, "Таймер идёт", NotificationManager.IMPORTANCE_LOW);
        running.setShowBadge(false);
        nm.createNotificationChannel(running);
        NotificationChannel done = new NotificationChannel(CH_DONE, "Таймер: время вышло", NotificationManager.IMPORTANCE_HIGH);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        done.setSound(sound, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        done.enableVibration(true);
        done.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
        nm.createNotificationChannel(done);
    }

    private static void showRunning(Context context, long endAt, String label) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification n = new Notification.Builder(context, CH_RUNNING)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle("Таймер")
                .setContentText(label)
                .setWhen(endAt)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_STOPWATCH)
                .setContentIntent(openApp(context))
                .addAction(new Notification.Action.Builder(null, "Остановить", broadcast(context, ACTION_STOP, 2)).build())
                .build();
        nm.notify(NOTIFICATION_ID, n);
    }

    private static void showDone(Context context, String label) {
        ensureChannels(context);
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification n = new Notification.Builder(context, CH_DONE)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle("Время вышло!")
                .setContentText(label)
                .setCategory(Notification.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(openApp(context))
                .addAction(new Notification.Action.Builder(null, "Готово", broadcast(context, ACTION_STOP, 2)).build())
                .build();
        n.flags |= Notification.FLAG_INSISTENT;
        nm.notify(NOTIFICATION_ID, n);
    }
}
