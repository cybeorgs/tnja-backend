-- Grievances can carry audio and video attachments alongside images and documents.
ALTER TABLE "Grievance" ADD COLUMN "audios" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Grievance" ADD COLUMN "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];
