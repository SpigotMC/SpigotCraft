# SpigotCraft
Make a server!

##Rules
* Do not submit content which you do not hold a license for.
* Be nice
* Use :+1: `:+1:` for additions you support, and :-1: `:-1:` for additions you don't. They will be pulled or closed when we feel like it based on these votes.
* Feel free to change groups, permissions, etc, but do not add yourself to them, this will be handled by the server operators.
* Plugins that require NMS won't work since the server will be running snapshots.

##Recommended Setup
* Clone this repo
* symlink the plugins dir into your test server: `ln -s SpigotCraft/plugins .`

##IRC
Join us on [irc.spi.gt, #spigot-server](https://irc.spi.gt/iris/?nick=&channels=spigot-server)

##Docker
Docker is an open platform for building, shipping and running distributed applications. It gives programmers, development teams and operations engineers the common toolbox they need to take advantage of the distributed and networked nature of modern applications.

For help on getting started with docker see the [official docker site](https://www.docker.com).

This docker image will build the latest version of spigot, adds the plugins and runs it inside a docker container.

###Building
building the image goes like this:

    git clone https://github.com/SpigotMC/SpigotCraft.git
    cd SpigotCraft
    docker build -t spigotcraft .

If you have build this before and want to make sure you get the latest spigot version run it like this:

    docker build --no-cache -t spigotcraft .

###Running

    docker run -it --rm -p 25565:25565 --name spigot spigotcraft

###EULA

Mojang requires accepting the [Minecraft EULA](https://account.mojang.com/documents/minecraft_eula). To accept add

    -e EULA=TRUE

such as

    docker run -it --rm -e EULA=TRUE -p 25565:25565 --name spigot spigotcraft


###Available environment variables
These environment variables are set by adding `-e` in the `docker run` command

`EULA` set to TRUE to Accept the [Minecraft EULA](https://account.mojang.com/documents/minecraft_eula)

`JAVA_XMS` Specifies the initial memory allocation pool in Java (default 128M)

`JAVA_XMX` Specifies the maximum memory allocation pool in Java (default 512M)

`JAVA_CPU_THREADS` defines the ParallelGCThreads (default 8)

`JVM_OPTS` Specify other optional JVM options
