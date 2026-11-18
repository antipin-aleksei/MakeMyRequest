use crate::{
    accounts,
    requests::{db_error, fail, ApiResult},
    AppState,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Datelike, NaiveDate, NaiveTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkWindow {
    weekday: u8,   // 0=Monday
    start: String, // HH:MM local
    end: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkSchedule {
    timezone: String,
    slots: Vec<WorkWindow>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preference {
    pub date_from: String,
    pub date_to: String,
    pub time_from: String,
    pub time_to: String,
}
fn clock(value: &str) -> Option<NaiveTime> {
    if value.len() != 5 {
        return None;
    }
    NaiveTime::parse_from_str(value, "%H:%M").ok()
}
fn valid_schedule(schedule: &WorkSchedule) -> bool {
    if schedule.timezone.parse::<Tz>().is_err() || schedule.slots.len() > 28 {
        return false;
    }
    let mut by_day = vec![Vec::<(NaiveTime, NaiveTime)>::new(); 7];
    for slot in &schedule.slots {
        let (Some(start), Some(end)) = (clock(&slot.start), clock(&slot.end)) else {
            return false;
        };
        if slot.weekday > 6 || start >= end {
            return false;
        }
        by_day[slot.weekday as usize].push((start, end));
    }
    for slots in &mut by_day {
        slots.sort();
        if slots.windows(2).any(|pair| pair[0].1 > pair[1].0) {
            return false;
        }
    }
    true
}
async fn load(db: &PgPool, artist_id: Uuid) -> Result<WorkSchedule, sqlx::Error> {
    let timezone: String = sqlx::query_scalar("SELECT timezone FROM artists WHERE id=$1")
        .bind(artist_id)
        .fetch_one(db)
        .await?;
    let rows=sqlx::query_as::<_,(i16,String,String)>(
        "SELECT weekday, to_char(start_time,'HH24:MI') AS start, to_char(end_time,'HH24:MI') AS end FROM artist_working_hours WHERE artist_id=$1 ORDER BY weekday,start_time"
    ).bind(artist_id).fetch_all(db).await?;
    Ok(WorkSchedule {
        timezone,
        slots: rows
            .into_iter()
            .map(|(weekday, start, end)| WorkWindow {
                weekday: weekday as u8,
                start,
                end,
            })
            .collect(),
    })
}
pub async fn public_schedule(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Json<WorkSchedule>> {
    let artist = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM artists WHERE slug=$1 AND active=true AND published=true",
    )
    .bind(slug)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND, "artist_not_found"))?;
    Ok(Json(load(&state.db, artist).await.map_err(db_error)?))
}
pub async fn my_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<WorkSchedule>> {
    let user = accounts::authenticated(&headers, &state.db).await?;
    if user.role() != "artist" {
        return Err(fail(StatusCode::FORBIDDEN, "forbidden"));
    }
    let artist = sqlx::query_scalar::<_, Uuid>("SELECT id FROM artists WHERE user_id=$1")
        .bind(user.id())
        .fetch_optional(&state.db)
        .await
        .map_err(db_error)?
        .ok_or_else(|| fail(StatusCode::NOT_FOUND, "complete_artist_profile_first"))?;
    Ok(Json(load(&state.db, artist).await.map_err(db_error)?))
}
pub async fn save_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<WorkSchedule>,
) -> ApiResult<Json<WorkSchedule>> {
    let user = accounts::authenticated(&headers, &state.db).await?;
    if user.role() != "artist" {
        return Err(fail(StatusCode::FORBIDDEN, "forbidden"));
    }
    if !valid_schedule(&body) {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_schedule"));
    }
    let mut tx = state.db.begin().await.map_err(db_error)?;
    let artist =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM artists WHERE user_id=$1 FOR UPDATE")
            .bind(user.id())
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or_else(|| fail(StatusCode::NOT_FOUND, "complete_artist_profile_first"))?;
    sqlx::query("UPDATE artists SET timezone=$2 WHERE id=$1")
        .bind(artist)
        .bind(&body.timezone)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("DELETE FROM artist_working_hours WHERE artist_id=$1")
        .bind(artist)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    for slot in &body.slots {
        sqlx::query("INSERT INTO artist_working_hours(artist_id,weekday,start_time,end_time) VALUES($1,$2,$3::time,$4::time)")
            .bind(artist).bind(slot.weekday as i16).bind(&slot.start).bind(&slot.end)
            .execute(&mut *tx).await.map_err(db_error)?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(Json(body))
}
fn preference_valid(pref: &Preference, schedule: &WorkSchedule, today: NaiveDate) -> bool {
    let (Ok(start_day), Ok(end_day)) = (
        NaiveDate::parse_from_str(&pref.date_from, "%Y-%m-%d"),
        NaiveDate::parse_from_str(&pref.date_to, "%Y-%m-%d"),
    ) else {
        return false;
    };
    let (Some(from), Some(to)) = (clock(&pref.time_from), clock(&pref.time_to)) else {
        return false;
    };
    if start_day < today
        || end_day < start_day
        || end_day.signed_duration_since(start_day).num_days() > 30
        || end_day.signed_duration_since(today).num_days() > 180
        || from >= to
    {
        return false;
    }
    let mut day = start_day;
    while day <= end_day {
        let weekday = day.weekday().num_days_from_monday() as u8;
        if schedule.slots.iter().any(|slot| {
            if slot.weekday != weekday {
                return false;
            }
            match (clock(&slot.start), clock(&slot.end)) {
                (Some(open), Some(close)) => open <= from && to <= close,
                _ => false,
            }
        }) {
            return true;
        }
        day = match day.succ_opt() {
            Some(value) => value,
            None => return false,
        };
    }
    false
}
pub async fn validate_preferences(
    db: &PgPool,
    artist: Uuid,
    prefs: &[Preference],
) -> ApiResult<Option<String>> {
    if prefs.len() > 3 {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_preferences"));
    }
    if prefs.is_empty() {
        return Ok(None);
    }
    let schedule = load(db, artist).await.map_err(db_error)?;
    let tz = schedule
        .timezone
        .parse::<Tz>()
        .map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_schedule"))?;
    let today = Utc::now().with_timezone(&tz).date_naive();
    if prefs.iter().all(|p| preference_valid(p, &schedule, today)) {
        Ok(Some(schedule.timezone))
    } else {
        Err(fail(StatusCode::BAD_REQUEST, "invalid_preferences"))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_overlap_and_inverted_times() {
        let a = WorkWindow {
            weekday: 0,
            start: "09:00".into(),
            end: "12:00".into(),
        };
        let b = WorkWindow {
            weekday: 0,
            start: "11:00".into(),
            end: "14:00".into(),
        };
        assert!(!valid_schedule(&WorkSchedule {
            timezone: "Europe/Berlin".into(),
            slots: vec![a, b]
        }));
    }
    #[test]
    fn checks_working_date_and_hours() {
        let s = WorkSchedule {
            timezone: "Europe/Berlin".into(),
            slots: vec![WorkWindow {
                weekday: 0,
                start: "10:00".into(),
                end: "18:00".into(),
            }],
        };
        let today = NaiveDate::from_ymd_opt(2026, 11, 16).unwrap(); // Monday
        let good = Preference {
            date_from: "2026-11-16".into(),
            date_to: "2026-11-16".into(),
            time_from: "13:00".into(),
            time_to: "15:00".into(),
        };
        assert!(preference_valid(&good, &s, today));
        let bad = Preference {
            time_to: "20:00".into(),
            ..good
        };
        assert!(!preference_valid(&bad, &s, today));
    }
}
