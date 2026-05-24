# --- builder ---------------------------------------------------------------
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO is OFF — we use the pure-Go modernc.org/sqlite driver.
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# --- runtime ---------------------------------------------------------------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
WORKDIR /app
COPY --from=builder /out/api /app/api
USER app
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/api"]
