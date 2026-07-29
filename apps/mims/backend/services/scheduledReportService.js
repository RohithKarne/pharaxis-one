const db = require('../database/db');
const emailService = require('./emailService');
const reportGenerator = require('./reportGenerator');

class ScheduledReportService {
    async createSchedule(data) {
        const { org_id, name, report_preset_id, schedule, format, recipients, created_by } = data;
        const result = await db.query(
            `INSERT INTO scheduled_reports 
             (org_id, name, report_preset_id, schedule, format, recipients, is_active, created_by) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *`,
            [org_id, name, report_preset_id, schedule, format, JSON.stringify(recipients), true, created_by]
        );
        return result.rows[0];
    }

    async listSchedules(orgId) {
        const result = await db.query(
            `SELECT * FROM scheduled_reports WHERE org_id = $1 ORDER BY created_at DESC`,
            [orgId]
        );
        return result.rows;
    }

    async deleteSchedule(id) {
        await db.query(
            `DELETE FROM scheduled_reports WHERE id = $1`,
            [id]
        );
    }

    async executeScheduledReport(scheduleId) {
        const result = await db.query(`SELECT * FROM scheduled_reports WHERE id = $1`, [scheduleId]);
        const schedule = result.rows[0];
        if (!schedule) {
            throw new Error(`Schedule not found: ${scheduleId}`);
        }

        const reportData = await reportGenerator.generate(schedule.report_preset_id, schedule.format);
        
        await emailService.sendReportEmail(
            schedule.recipients, 
            `Scheduled Report: ${schedule.name}`, 
            reportData, 
            schedule.format
        );

        await db.query(`UPDATE scheduled_reports SET last_run_at = NOW() WHERE id = $1`, [scheduleId]);
        return { success: true };
    }
}

module.exports = new ScheduledReportService();
