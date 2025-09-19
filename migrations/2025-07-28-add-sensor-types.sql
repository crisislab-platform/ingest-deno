-- Add channels field to sensor_types
ALTER TABLE sensor_types
ADD COLUMN "channels" jsonb;


-- Add type_fk to sensors
ALTER TABLE sensors
ADD COLUMN "type_fk" text;

ALTER TABLE sensors
ADD CONSTRAINT fk_type FOREIGN KEY ("type_fk") REFERENCES sensor_types("name");