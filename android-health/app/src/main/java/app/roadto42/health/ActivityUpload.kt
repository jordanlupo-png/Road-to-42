package app.roadto42.health

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ActivityUpload(
    @SerialName("user_id") val userId: String,
    @SerialName("activity_date") val activityDate: String,
    @SerialName("activity_type") val activityType: String = "Easy",
    @SerialName("distance_km") val distanceKm: Double,
    @SerialName("duration_minutes") val durationMinutes: Double,
    @SerialName("pace_seconds_per_km") val paceSecondsPerKm: Int?,
    val source: String = "health_connect",
    @SerialName("external_id") val externalId: String,
    @SerialName("source_recorded_at") val sourceRecordedAt: String,
    @SerialName("average_heart_rate") val averageHeartRate: Int? = null
)
