-- Each call books at most one visit; the link lets the tools enforce that and the team app show it.
alter table calls add column booked_job_id uuid references jobs(id);
