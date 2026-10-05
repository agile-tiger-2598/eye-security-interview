-- migrate:up
CREATE TABLE imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status text NOT NULL DEFAULT 'pending',
    total_records integer NOT NULL,
    successful_records integer NOT NULL DEFAULT 0,
    failed_records integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT imports_status_valid CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    ),
    CONSTRAINT imports_processed_records_within_total CHECK (
        successful_records + failed_records <= total_records
    ),
    CONSTRAINT imports_timestamps_ordered CHECK (updated_at >= created_at)
);

CREATE TABLE import_failures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id uuid NOT NULL REFERENCES imports (id) ON DELETE CASCADE,
    record_id text NOT NULL,
    stage text NOT NULL,
    payload jsonb NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT import_failures_record_id_nonempty CHECK (
        btrim(record_id) <> ''
    ),
    CONSTRAINT import_failures_stage_valid CHECK (
        stage IN ('enrichment', 'analytics')
    ),
    CONSTRAINT import_failures_payload_object CHECK (
        jsonb_typeof(payload) = 'object'
    ),
    CONSTRAINT import_failures_reason_nonempty CHECK (btrim(reason) <> '')
);

CREATE INDEX import_failures_import_id_idx ON import_failures (import_id);

-- migrate:down
