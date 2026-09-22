package app.roadto42.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

class HealthConnectRepository(private val client: HealthConnectClient) {
    suspend fun recentRuns(days: Long = 30): List<ActivityUpload> {
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(days))
        val sessions = client.readRecords(
            ReadRecordsRequest(
                recordType = ExerciseSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(start, end)
            )
        ).records.filter { it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING }

        return sessions.mapNotNull { session ->
            val aggregate = client.aggregate(
                AggregateRequest(
                    metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(session.startTime, session.endTime)
                )
            )
            val km = (aggregate[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0) / 1000.0
            if (km <= 0.0) return@mapNotNull null
            val seconds = Duration.between(session.startTime, session.endTime).seconds.coerceAtLeast(1)
            ActivityUpload(
                userId = "",
                activityDate = session.startTime.atZone(ZoneId.systemDefault()).toLocalDate().toString(),
                distanceKm = km,
                durationMinutes = seconds / 60.0,
                paceSecondsPerKm = (seconds / km).toInt(),
                externalId = session.metadata.id,
                sourceRecordedAt = session.startTime.toString()
            )
        }
    }
}
