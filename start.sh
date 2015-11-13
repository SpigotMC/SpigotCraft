#!/bin/bash
set -e

if [ ! -e eula.txt ]; then
  if [ "$EULA" != "" ]; then
    echo "# Generated via Docker on $(date)" > eula.txt
    echo "eula=$EULA" >> eula.txt
  else
    echo ""
    echo "Please accept the Minecraft EULA at"
    echo "  https://account.mojang.com/documents/minecraft_eula"
    echo "by adding the following immediately after 'docker run':"
    echo "  -e EULA=TRUE"
    echo ""
    exit 1
  fi
fi

if [ -z "$JAVA_XMS" ]; then
    JAVA_XMS=128M
fi

if [ -z "$JAVA_XMX" ]; then
    JAVA_XMX=512M
fi

if [ -z "$JAVA_CPU_THREADS" ]; then
    JAVA_CPU_THREADS=8
fi

if [ -z "$JVM_OPTS" ]; then
    JVM_OPTS=""
fi

exec java -Xms$JAVA_XMS -Xmx$JAVA_XMX -XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+CMSIncrementalPacing -XX:ParallelGCThreads=$JAVA_CPU_THREADS -XX:+AggressiveOpts $JVM_OPTS -jar spigot.jar
