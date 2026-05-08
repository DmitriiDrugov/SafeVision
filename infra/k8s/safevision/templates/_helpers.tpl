{{/*
Expand the name of the chart.
*/}}
{{- define "safevision.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "safevision.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "safevision.labels" -}}
helm.sh/chart: {{ include "safevision.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "safevision.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (stable across upgrades).
*/}}
{{- define "safevision.selectorLabels" -}}
app.kubernetes.io/name: {{ include "safevision.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Resolve a service image: <registry>/<repository>:<tag>
Usage: {{ include "safevision.image" (dict "root" . "svc" .Values.ingestion) }}
*/}}
{{- define "safevision.image" -}}
{{- $root := .root -}}
{{- $svc := .svc -}}
{{- $tag := default $root.Values.global.imageTag $svc.image.tag -}}
{{- printf "%s/%s:%s" $root.Values.global.imageRegistry $svc.image.repository $tag -}}
{{- end }}

{{/*
Resolve Redis URL (internal StatefulSet or external).
*/}}
{{- define "safevision.redisUrl" -}}
{{- if .Values.redis.internal -}}
{{- printf "redis://%s-redis:6379" (include "safevision.fullname" .) -}}
{{- else -}}
{{- .Values.redis.url -}}
{{- end -}}
{{- end }}

{{/*
Resolve PostgreSQL DATABASE_URL (internal StatefulSet or external).
*/}}
{{- define "safevision.databaseUrl" -}}
{{- if .Values.postgres.internal -}}
{{- printf "postgresql+asyncpg://%s:%s@%s-postgres:5432/%s" .Values.postgres.username .Values.postgres.password (include "safevision.fullname" .) .Values.postgres.database -}}
{{- else -}}
{{- .Values.postgres.url -}}
{{- end -}}
{{- end }}

{{/*
Resolve MinIO endpoint (internal StatefulSet or external).
*/}}
{{- define "safevision.minioEndpoint" -}}
{{- if .Values.minio.internal -}}
{{- printf "%s-minio:9000" (include "safevision.fullname" .) -}}
{{- else -}}
{{- .Values.minio.endpoint -}}
{{- end -}}
{{- end }}

{{/*
Resolve MinIO access key.
*/}}
{{- define "safevision.minioAccessKey" -}}
{{- if .Values.minio.internal -}}
{{- .Values.minio.rootUser -}}
{{- else -}}
{{- .Values.minio.accessKey -}}
{{- end -}}
{{- end }}

{{/*
Resolve MinIO secret key.
*/}}
{{- define "safevision.minioSecretKey" -}}
{{- if .Values.minio.internal -}}
{{- .Values.minio.rootPassword -}}
{{- else -}}
{{- .Values.minio.secretKey -}}
{{- end -}}
{{- end }}
