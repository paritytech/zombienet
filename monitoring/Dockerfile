FROM golang:alpine AS build
WORKDIR /app
COPY . .
RUN go build -o main .

# Stage 2: Run
FROM alpine
WORKDIR /app
COPY --from=build /app/main /app/
CMD ["/app/main"]
