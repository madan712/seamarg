FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /workspace

COPY gradlew gradlew
COPY gradle gradle
COPY settings.gradle build.gradle gradle.properties ./
COPY backend/build.gradle backend/settings.gradle backend/
COPY backend/src backend/src

RUN ./gradlew :backend:bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN addgroup -S seamarg && adduser -S seamarg -G seamarg

COPY --from=build /workspace/backend/build/libs/seamarg-backend.jar app.jar

USER seamarg
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
