# Backend image: Maven build, then a JRE-only runtime.
#
# The base images are build args on purpose. A build behind a private registry
# mirror, or one that has to bake a corporate CA into the toolchain, substitutes
# its own bases instead of editing (and then having to maintain) this file.
ARG MAVEN_IMAGE=maven:3.9-eclipse-temurin-21
ARG JRE_IMAGE=eclipse-temurin:21-jre-alpine

FROM ${MAVEN_IMAGE} AS build
WORKDIR /src

# The local repository is a cache mount at /m2, deliberately not /root/.m2: a mount over
# /root/.m2 would hide a settings.xml that a mirror base image ships there, which is
# exactly the setup MAVEN_IMAGE exists to support.
ENV MAVEN_REPO=/m2

# Resolve dependencies from the POM alone first. The step produces no image layer - the
# jars live in the cache mount - but it is keyed on pom.xml, so a source-only change
# replays it from the build cache instead of re-resolving.
COPY pom.xml ./
RUN --mount=type=cache,target=/m2 mvn -B -q -Dmaven.repo.local=$MAVEN_REPO dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/m2 mvn -B -DskipTests -Dmaven.repo.local=$MAVEN_REPO package \
 && cp target/vdt-analyzer-*.jar /src/app.jar

FROM ${JRE_IMAGE} AS runtime

# Nothing is installed here. Alpine's busybox already provides the wget the
# healthcheck needs, so the runtime layer requires no network at build time.
RUN addgroup -S vdt && adduser -S -G vdt vdt
WORKDIR /app
COPY --from=build /src/app.jar app.jar
USER vdt

EXPOSE 8080

# Sizes the heap from the container's memory limit. This only bounds anything when a
# limit is actually set - with none, the JVM reads the host's RAM and 75% of a 16 GB
# machine becomes the max heap. docker-compose.yml therefore sets one (BACKEND_MEMORY).
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

# /api/sessions is the readiness signal, not a liveness ping: it round-trips to
# PostgreSQL, so it stays red until Flyway and the seeder have finished. The start
# period covers that first-boot seed; after it, six failures in a minute mean the
# service is genuinely down.
HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/sessions || exit 1

# exec, so the JVM is PID 1's process and receives SIGTERM from `docker stop`.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
