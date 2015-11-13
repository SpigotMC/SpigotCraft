FROM java:8

RUN useradd -s /bin/bash -d /opt/spigot spigot

ENV spigot_rev latest

ADD https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar /tmp/spigot/BuildTools.jar
RUN cd /tmp/spigot; java -jar BuildTools.jar --rev $spigot_rev
RUN mkdir /opt/spigot && cp /tmp/spigot/spigot-*.jar /opt/spigot/spigot.jar && rm -rf /tmp/spigot

ADD start.sh /opt/spigot/
RUN chmod +x /opt/spigot/start.sh

ADD plugins /opt/spigot/plugins
RUN chown -R spigot /opt/spigot

EXPOSE 25565

USER spigot
WORKDIR /opt/spigot

CMD ["./start.sh"]
