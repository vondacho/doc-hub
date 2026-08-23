{{/*
Expand the name of the chart.
*/}}
{{- define "doc-es.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name, capped at 63 chars for the DNS label limit.
*/}}
{{- define "doc-es.fullname" -}}
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

{{- define "doc-es.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "doc-es.labels" -}}
helm.sh/chart: {{ include "doc-es.chart" . }}
{{ include "doc-es.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: doc-hub
{{- end }}

{{- define "doc-es.selectorLabels" -}}
app.kubernetes.io/name: {{ include "doc-es.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "doc-es.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "doc-es.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference, defaulting the tag to the chart appVersion.
*/}}
{{- define "doc-es.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}
