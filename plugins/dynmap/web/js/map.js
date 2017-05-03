"use strict";
//if (!console) console = { log: function() {} };

var componentconstructors = {};
var maptypes = {};
var map = null;	// Leaflet assumes top-level 'map'...

componentconstructors['testcomponent'] = function(dynmap, configuration) {
	console.log('initialize');
	$(dynmap).bind('worldchanged', function() { console.log('worldchanged'); });
	$(dynmap).bind('mapchanging', function() { console.log('mapchanging'); });
	$(dynmap).bind('mapchanged', function() { console.log('mapchanged'); });
	$(dynmap).bind('zoomchanged', function() { console.log('zoomchanged'); });
	$(dynmap).bind('worldupdating', function() { console.log('worldupdating'); });
	$(dynmap).bind('worldupdate', function() { console.log('worldupdate'); });
	$(dynmap).bind('worldupdated', function() { console.log('worldupdated'); });
	$(dynmap).bind('worldupdatefailed', function() { console.log('worldupdatefailed'); });
	$(dynmap).bind('playeradded', function() { console.log('playeradded'); });
	$(dynmap).bind('playerremoved', function() { console.log('playerremoved'); });
	$(dynmap).bind('playerupdated', function() { console.log('playerupdated'); });
};

function DynMap(options) {
	var me = this;
	if(me.checkForSavedURL())
		return;
	me.options = options;
	$.getJSON(me.options.url.configuration, function(configuration) {
		if(configuration.error == 'login-required') {
			me.saveURL();
			window.location = 'login.html';
		}
		else if(configuration.error) {
			alert(configuration.error);
		}
		else {
			me.configure(configuration);
			me.initialize();
		}
	}, function(status, statusMessage) {
		alert('Could not retrieve configuration: ' + statusMessage);
	});
}
DynMap.prototype = {
	components: [],
	worlds: {},
	registeredTiles: [],
	players: {},
	lasttimestamp: new Date().getUTCMilliseconds(), /* Pseudorandom - prevent cached '?0' */
	reqid: 0,
    servertime: 0,
    serverday: false,
    inittime: new Date().getTime(),
	followingPlayer: '',
	initfollow: null,
	missedupdates: 0,
	maxcount: -1,
	currentcount: 0,
	playerfield: null,
	layercontrol: undefined,
	nogui: false,
	nocompass: false,
	formatUrl: function(name, options) {
		var url = this.options.url[name];
		$.each(options, function(n,v) {
			url = url.replace("{" + n + "}", v);
		});
		return url;
	},
	configure: function(configuration) {
		var me = this;
		$.extend(me.options, configuration);

		$.each(me.options.worlds, function(index, worldentry) {
			var world = me.worlds[worldentry.name] = $.extend({}, worldentry, {
				maps: {}
			});

			$.each(worldentry.maps, function(index, mapentry) {
				var map = $.extend({}, mapentry, {
					world: world,
					dynmap: me
				});
				map = world.maps[mapentry.name] = maptypes[mapentry.type](map);
				if(me.options.defaultmap && me.options.defaultmap == mapentry.name)
					world.defaultmap = map;
				world.defaultmap = world.defaultmap || map;
			});
			me.defaultworld = me.defaultworld || world;
		});
		var urlarg = me.getParameterByName('worldname');
		if(urlarg == "")
			urlarg = me.options.defaultworld || "";
		if(urlarg != "") {
		    me.defaultworld = me.worlds[urlarg] || me.defaultworld;
		}
		urlarg = me.getParameterByName('mapname');
		if(urlarg != "") {
			me.defaultworld.defaultmap = me.defaultworld.maps[urlarg] || me.defaultworld.defaultmap;
		}
		urlarg = me.getIntParameterByName('x');
		if(urlarg != null)
			me.defaultworld.center.x = urlarg;
		urlarg = me.getIntParameterByName('y');
		if(urlarg != null)
			me.defaultworld.center.y = urlarg;
		urlarg = me.getIntParameterByName('z');
		if(urlarg != null)
			me.defaultworld.center.z = urlarg;
		urlarg = me.getParameterByName('nogui');
		if(urlarg != "") {
			me.nogui = (urlarg == 'true');
		}
		urlarg = me.getParameterByName('nocompass');
		if(urlarg != "") {
			me.nocompass = (urlarg == 'true');
		}
	},
	initialize: function() {
		var me = this;

		// Get a handle to the DOM element which acts as the overall container and apply a class of
		// "dynmap" to it.
		var container = $(me.options.container);
		container.addClass('dynmap');

		// Create a new container within the main container which actually holds the map. It needs a
		// class of "map".
		var mapContainer;
		(mapContainer = $('<div/>'))
			.addClass('map')
			.appendTo(container);

		// Set the title if the options specify one.
		if(me.options.title)
			document.title = me.options.title;

		// Try to set the default zoom level based on the URL parameter.
		var urlzoom = me.getIntParameterByName('zoom');
		if(urlzoom != null)
			me.options.defaultzoom = urlzoom;

		// Decide whether or not the layer control will be visible based on the URL parameter or
		// or fallback to the options
		var showlayerctl = me.getParameterByName('showlayercontrol');
		if(showlayerctl != "")
			me.options.showlayercontrol = showlayerctl;

		// If we still don't have a default zoom level, force it to be 1
		if(typeof me.options.defaultzoom == 'undefined')
			me.options.defaultzoom = 1;

		// Decide whether we should be following a given player or not based solely on URL parameter.
		var initfollowplayer = me.getParameterByName('playername');
		if(initfollowplayer != "")
			me.initfollow = initfollowplayer;

		// Derive the state of the sidebar based on the URL parameter.
		var sidebaropen = me.getParameterByName('sidebaropened');
		if(sidebaropen == 'false' || sidebaropen == 'true' || sidebaropen == 'pinned')
			me.options.sidebaropened = sidebaropen;

		var map = this.map = new L.Map(mapContainer.get(0), {
			zoom: me.options.defaultzoom,
			center: new L.LatLng(0, 0),
			zoomAnimation: true,
			zoomControl: !me.nogui,
			attributionControl: false,
			crs: L.extend({}, L.CRS, {
				code: 'simple',
				projection: {
						project: function(latlng) {
							// Direct translation of lat -> x, lng -> y.
							return new L.Point(latlng.lat, latlng.lng);
						},
						unproject: function(point) {
							// Direct translation of x -> lat, y -> lng.
							return new L.LatLng(point.x, point.y);
						}
					},
				// a = 1; b = 2; c = 1; d = 0
				// x = a * x + b; y = c * y + d
				// End result is 1:1 values during transformation.
				transformation: new L.Transformation(1, 0, 1, 0),
				scale: function(zoom) {
					// Equivalent to 2 raised to the power of zoom, but faster.
					return (1 << zoom);
				}
			}),
			continuousWorld: true,
			worldCopyJump: false
		});
		window.map = map; // Placate Leaflet need for top-level 'map'....

		map.on('zoomend', function() {
			me.maptype.updateTileSize(me.map.getZoom());
			$(me).trigger('zoomchanged');
		});

		/*google.maps.event.addListener(map, 'dragstart', function(mEvent) {
			me.followPlayer(null);
		});*/

		// Sidebar
		var panel;
		var sidebar;
		var pinbutton;
		var nopanel = (me.getParameterByName('nopanel') == 'true') || me.nogui;

		if(me.options.sidebaropened != 'true') { // false or pinned
			var pincls = 'pinned'
			if(me.options.sidebaropened == 'false')
				pincls = '';

			sidebar = me.sidebar = $('<div/>')
					.addClass('sidebar ' + pincls);

			panel = $('<div/>')
				.addClass('panel')
				.appendTo(sidebar);

			// Pin button.
			pinbutton = $('<div/>')
				.addClass('pin')
				.click(function() {
					sidebar.toggleClass('pinned');
				})
				.appendTo(panel);
		}
		else {
			sidebar = me.sidebar = $('<div/>')
				.addClass('sidebar pinned');

			panel = $('<div/>')
				.addClass('panel')
				.appendTo(sidebar);
		}
		if(!nopanel)
			sidebar.appendTo(container);

		// World scrollbuttons
		var upbtn_world = $('<div/>')
		.addClass('scrollup')
		.bind('mousedown mouseup touchstart touchend', function(event){
	    	if(event.type == 'mousedown' || event.type == 'touchstart'){
				worldlist.animate({"scrollTop": "-=300px"}, 3000, 'linear');
	    	}else{
	        	worldlist.stop();
	    	}
		});
		var downbtn_world = $('<div/>')
		.addClass('scrolldown')
		.bind('mousedown mouseup touchstart touchend', function(event){
	    	if(event.type == 'mousedown' || event.type == 'touchstart'){
				worldlist.animate({"scrollTop": "+=300px"}, 3000, 'linear');
	    	}else{
	        	worldlist.stop();
	    	}
		});

		// Worlds
		var worldlist;
		$('<fieldset/>')
			.append($('<legend/>').text(me.options['msg-maptypes']))
			.append(upbtn_world)
			.append(me.worldlist = worldlist = $('<ul/>').addClass('worldlist')
				.bind('mousewheel', function(event, delta){
					this.scrollTop -= (delta * 10);
					event.preventDefault();
				})
			)
			.append(downbtn_world)
			.appendTo(panel);

        var maplists = {};
		var worldsadded = {};
		$.each(me.worlds, function(index, world) {
			var maplist;
			world.element = $('<li/>')
				.addClass('world')
				.text(world.title)
				.append(maplist = $('<ul/>')
						.addClass('maplist')
						)
				.data('world', world);
			maplists[world.name] = maplist;
		});

		$.each(me.worlds, function(index, world) {
			var maplist = maplists[world.name];

			$.each(world.maps, function(mapindex, map) {
				//me.map.mapTypes.set(map.world.name + '.' + map.name, map);
				var wname = world.name;
				if(map.options.append_to_world) {
					wname = map.options.append_to_world;
				}
				var mlist = maplists[wname];
				if(!mlist) {
					mlist = maplist;
					wname = world.name;
				}
				if(!worldsadded[wname]) {
					worldsadded[wname] = true;
				}

				map.element = $('<li/>')
					.addClass('map')
					.append($('<a/>')
							.attr({ title: map.options.title, href: '#' })
							.addClass('maptype')
							.css({ backgroundImage: 'url(' + (map.options.icon || ('images/block_' + mapindex + '.png')) + ')' })
							.text(map.options.title)
							)
					.click(function() {
						me.selectMap(map);
					})
					.data('map', map)
					.appendTo(mlist);
			});
		});
		$.each(me.worlds, function(index, world) {
			if(worldsadded[world.name]) {
				world.element.appendTo(worldlist);
			}
		});

		// The scrollbuttons
		// we need to show/hide them depending: if (me.playerlist.scrollHeight() > me.playerlist.innerHeight()) or something.
		var upbtn = $('<div/>')
		.addClass('scrollup')
		.bind('mousedown mouseup touchstart touchend', function(event){
		    if(event.type == 'mousedown' || event.type == 'touchstart'){
				playerlist.animate({"scrollTop": "-=300px"}, 3000, 'linear');
		    }else{
		        playerlist.stop();
		    }
		});
		var downbtn = $('<div/>')
		.addClass('scrolldown')
		.bind('mousedown mouseup touchstart touchend', function(event){
		    if(event.type == 'mousedown' || event.type == 'touchstart'){
				playerlist.animate({"scrollTop": "+=300px"}, 3000, 'linear');
		    }else{
		        playerlist.stop();
		    }
		});

		// The Player List
		var playerlist;
		$('<fieldset/>')
			.append(me.playerfield = $('<legend/>').text(me.options['msg-players']))
			.append(upbtn)
			.append(me.playerlist = playerlist = $('<ul/>').addClass('playerlist')
				.bind('mousewheel', function(event, delta){
					this.scrollTop -= (delta * 10);
					event.preventDefault();
				})
			)
			.append(downbtn)
			.appendTo(panel);

		var updateHeight = function() {
			if(sidebar.innerHeight() > (2*worldlist.scrollHeight())) { /* Big enough */
				worldlist.height(worldlist.scrollHeight());
				upbtn_world.toggle(false);
				downbtn_world.toggle(false);
			}
			else{
				worldlist.height(sidebar.innerHeight() / 2);
				upbtn_world.toggle(true);
				downbtn_world.toggle(true);
			}
			playerlist.height(sidebar.innerHeight() - (playerlist.offset().top - worldlist.offset().top) - 64); // here we need a fix to avoid the static value, but it works fine this way :P
			var scrollable = playerlist.scrollHeight() > playerlist.height();
			upbtn.toggle(scrollable);
			downbtn.toggle(scrollable);
		};
		updateHeight();
		$(window).resize(updateHeight);
		$(dynmap).bind('playeradded', function() {
			updateHeight();
		});
		$(dynmap).bind('playerremoved', function() {
			updateHeight();
		});
		// The Compass
		var compass = $('<div/>').
			addClass('compass');
		if(L.Browser.mobile)
			compass.addClass('mobilecompass');
		if ((!me.nogui) && (!me.nocompass)) {
			compass.appendTo(container);
		}
		
		if(me.options.sidebaropened != 'true') {
			var hitbar = $('<div/>')
			.addClass('hitbar')
			.click(function() {
				sidebar.toggleClass('pinned');
			})
			.appendTo(panel);
		}

		var alertbox = me.alertbox = $('<div/>')
			.addClass('alertbox')
			.hide()
			.appendTo(container);

		if((dynmapversion != me.options.coreversion) && (dynmapversion.indexOf("-Dev") < 0)) { // Disable on dev builds
			me.alertbox
				.text('Web files are not matched with plugin version: All files need to be same version (' + me.options.dynmapversion + ') - try refreshing browser cache (shift-reload)')
				.show();
			return;
		}

		me.initLogin();

		me.selectMap(me.defaultworld.defaultmap);

		var componentstoload = 0;
		var configset = { };
		if (!me.nogui) {
			$.each(me.options.components, function(index, configuration) {
				if(!configset[configuration.type]) {
					configset[configuration.type] = [];
					componentstoload++;
				}
				configset[configuration.type].push(configuration);
			});
		}

		var tobeloaded = {};
		$.each(configset, function(type, configlist) {
		    tobeloaded[type] = true;
			loadjs('js/' + type + '.js', function() {
				var componentconstructor = componentconstructors[type];
				if (componentconstructor) {
					$.each(configlist, function(idx, configuration) {
						me.components.push(new componentconstructor(me, configuration));
					});
				} else {
					// Could not load component. We'll ignore this for the moment.
				}
				delete tobeloaded[type];
				componentstoload--;
				if (componentstoload == 0) {
					// Actually start updating once all components are loaded.
					setTimeout(function() { me.update(); }, me.options.updaterate);
				}
			});
		});
		if (me.nogui) {
			setTimeout(function() { me.update(); }, me.options.updaterate);
		}
		else {
			setTimeout(function() {
				$.each(configset, function(type, configlist) {
					if(tobeloaded[type]) {
						me.alertbox
							.text('Error loading js/' + type + '.js')
							.show();
					}
				});
				if(componentstoload > 0)
					setTimeout(function() { me.update(); }, me.options.updaterate);
			}, 15000);
		}
	},
	getProjection: function() { return this.maptype.getProjection(); },
	selectMapAndPan: function(map, location, completed) {
		if (!map) { throw "Cannot select map " + map; }
		var me = this;

		if (me.maptype === map) {
			return;
		}
		$(me).trigger('mapchanging');
		var mapWorld = map.options.world;
		if (me.maptype) {
			$('.compass').removeClass('compass_' + me.maptype.options.compassview);
			$('.compass').removeClass('compass_' + me.maptype.options.name);
		}
		$('.compass').addClass('compass_' + map.options.compassview);
		$('.compass').addClass('compass_' + map.options.name);
		var worldChanged = me.world !== map.options.world;
		var projectionChanged = (me.maptype && me.maptype.getProjection()) !== (map && map.projection);

		var prevzoom = me.map.getZoom();

		var prevworld = me.world;

		if(worldChanged) {	// World changed - purge URL cache (tile updates unreported for other worlds)
			me.registeredTiles = [];
		    me.inittime = new Date().getTime();
		}

		if(worldChanged && me.world) {
			me.world.lastcenter = me.maptype.getProjection().fromLatLngToLocation(me.map.getCenter(), 64);
		}

		if (me.maptype) {
			me.map.removeLayer(me.maptype);
		}

		var prevmap = me.maptype;

		me.world = mapWorld;
		me.maptype = map;

		if(me.maptype.options.maxZoom < prevzoom)
			prevzoom = me.maptype.options.maxZoom;
		me.map.options.maxZoom = me.maptype.options.maxZoom;
		me.map.options.minZoom = me.maptype.options.minZoom;

		if (projectionChanged || worldChanged || location) {
			var centerPoint;
			if(location) {
				centerPoint = me.getProjection().fromLocationToLatLng(location);
			}
			else if(worldChanged) {
				var centerLocation;
				if(mapWorld.lastcenter)
					centerLocation = mapWorld.lastcenter;
				else
					centerLocation = $.extend({ x: 0, y: 64, z: 0 }, mapWorld.center);
				centerPoint = me.getProjection().fromLocationToLatLng(centerLocation);
			}
			else {
				var prevloc = null;
				if(prevmap != null)
					prevloc = prevmap.getProjection().fromLatLngToLocation(me.map.getCenter(), 64);
				if(prevloc != null)
					centerPoint = me.getProjection().fromLocationToLatLng(prevloc);
				else
					centerPoint = me.map.getCenter();
			}
			me.map.setView(centerPoint, prevzoom, true);
		}
		else {
			me.map.setZoom(prevzoom);
		}
		me.map.addLayer(me.maptype);

		if (worldChanged) {
			$(me).trigger('worldchanged');
		}
		$(me).trigger('mapchanged');

		$('.map', me.worldlist).removeClass('selected');
		$(map.element).addClass('selected');
		me.updateBackground();


		if (completed) {
			completed();
		}
	},
	selectMap: function(map, completed) {
		this.selectMapAndPan(map, null, completed);
	},
	selectWorldAndPan: function(world, location, completed) {
		var me = this;
		if (typeof(world) === 'String') { world = me.worlds[world]; }
		if (me.world === world) {
			if(location) {
				var latlng = me.maptype.getProjection().fromLocationToLatLng(location);
				me.panToLatLng(latlng, completed);
			}
			else {
				if (completed) { completed(); }
			}
			return;
		}
		me.selectMapAndPan(world.defaultmap, location, completed);
	},
	selectWorld: function(world, completed) {
		this.selectWorldAndPan(world, null, completed);
	},
	panToLocation: function(location, completed) {
		var me = this;

		if (location.world) {
			me.selectWorldAndPan(location.world, location, function() {
				if(completed) completed();
			});
		} else {
			var latlng = me.maptype.getProjection().fromLocationToLatLng(location);
			me.panToLatLng(latlng, completed);
		}
	},
	panToLayerPoint: function(point, completed) {
		var me = this;
		var latlng = me.map.layerPointToLatLng(point);
		me.map.panToLatLng(latlng);
		if (completed) {
			completed();
		}
	},
	panToLatLng: function(latlng, completed) {
		this.map.panTo(latlng);
		if (completed) {
			completed();
		}
	},
	update: function() {
		var me = this;

		$(me).trigger('worldupdating');
		$.getJSON(me.formatUrl('update', { world: me.world.name, timestamp: me.lasttimestamp, reqid: me.reqid }), function(update) {
				me.reqid++; // Bump request ID always
				if (!update) {
					setTimeout(function() { me.update(); }, me.options.updaterate);
					return;
				}
				me.alertbox.hide();

				if(update.error) {
					if(update.error == 'login-required') {
						me.saveURL();
						window.location = 'login.html';
					}
					else {
						alert(update.error);
					}
					return;
				}
				if (me.lasttimestamp == update.timestamp) { // Same as last update?
					setTimeout(function() { me.update(); }, me.options.updaterate);
					return;
				}

				if (!me.options.jsonfile) {
					me.lasttimestamp = update.timestamp;
				}
				if(me.options.confighash != update.confighash) {
				    window.location = me.getLink();
					return;
				}
				me.playerfield.text(me.options['msg-players'] + " [" + update.currentcount + "/" + me.options.maxcount + "]");

				me.servertime = update.servertime;
				var newserverday = (me.servertime > 23100 || me.servertime < 12900);
				if(me.serverday != newserverday) {
					me.serverday = newserverday;

					me.updateBackground();
					if(me.maptype.options.nightandday) {
						// Readd map.
						me.map.removeLayer(me.maptype);
						me.map.addLayer(me.maptype);
					}
				}

				var newplayers = {};
				$.each(update.players, function(index, playerUpdate) {
					var acct = playerUpdate.account;
					var player = me.players[acct];
					if (player) {
						me.updatePlayer(player, playerUpdate);
					} else {
						me.addPlayer(playerUpdate);
						if(me.initfollow && (me.initfollow == acct)) {
							me.followPlayer(me.players[acct]);
							me.initfollow = null;
						}
					}
					newplayers[acct] = player;
				});
				var acct;
				for(acct in me.players) {
					var player = me.players[acct];
					if(!(acct in newplayers)) {
						me.removePlayer(player);
					}
				}

				$.each(update.updates, function(index, update) {
					// Only handle updates that are actually new.
					if(!me.options.jsonfile || me.lasttimestamp <= update.timestamp) {
						$(me).trigger('worldupdate', [ update ]);

						swtch(update.type, {
							tile: function() {
								me.onTileUpdated(update.name,update.timestamp);
							},
							playerjoin: function() {
								$(me).trigger('playerjoin', [ update.playerName ]);
							},
							playerquit: function() {
								$(me).trigger('playerquit', [ update.playerName ]);
							},
							component: function() {
								$(me).trigger('component.' + update.ctype, [ update ]);
							}
						});
					}
					/* remove older messages from chat*/
					//var timestamp = event.timeStamp;
					//var divs = $('div[rel]');
					//divs.filter(function(i){return parseInt(divs[i].attr('rel')) > timestamp+me.options.messagettl;}).remove();
				});

				$(me).trigger('worldupdated', [ update ]);

				me.lasttimestamp = update.timestamp;
				me.missedupdates = 0;
				setTimeout(function() { me.update(); }, me.options.updaterate);
			}, function(status, statusText, request) {
				me.lasttimestamp--;	// Avoid same TS URL
				me.missedupdates++;
				if(me.missedupdates > 2) {
					me.alertbox
						.text('Could not update map: ' + (statusText || 'Could not connect to server'))
						.show();
					$(me).trigger('worldupdatefailed');
				}
				setTimeout(function() { me.update(); }, me.options.updaterate);
			}
		);
	},
	getTileUrl: function(tileName, always) {
		var me = this;
		var tile = me.registeredTiles[tileName];

		if(tile == null) {
			var url = me.options.url.tiles;
			if(url.indexOf('?') > 0)
				tile = this.registeredTiles[tileName] = url + escape(me.world.name + '/' + tileName) + '&ts=' + me.inittime;
			else
				tile = this.registeredTiles[tileName] = url + me.world.name + '/' + tileName + '?' + me.inittime;
		}
		return tile;
	},
	onTileUpdated: function(tileName,timestamp) {
		var me = this;
		var url = me.options.url.tiles;
		if(url.indexOf('?') > 0)
			this.registeredTiles[tileName] = url + escape(me.world.name + '/' + tileName) + '&ts=' + timestamp;
		else
			this.registeredTiles[tileName] = url + me.world.name + '/' + tileName + '?' + timestamp;
		me.maptype.updateNamedTile(tileName);
	},
	addPlayer: function(update) {
		var me = this;
		var player = me.players[update.account] = {
				name: update.name,
				location: new Location(me.worlds[update.world], parseFloat(update.x), parseFloat(update.y), parseFloat(update.z)),
				health: update.health,
				armor: update.armor,
				account: update.account,
				sort: update.sort
		};

		$(me).trigger('playeradded', [ player ]);

		// Create the player-menu-item.
		var playerIconContainer;
		var menuitem = player.menuitem = $('<li/>')
			.addClass('player')
			.append(playerIconContainer = $('<span/>')
				.addClass('playerIcon')
				.append($('<img/>').attr({ src: 'images/player_face.png' }))
				.attr({ title: 'Follow player' })
				.click(function() {
					var follow = player !== me.followingPlayer;
					me.followPlayer(follow ? player : null);
				})
			)
			.append(player.menuname = $('<a/>')
				.attr({
					href: '#',
					title: 'Center on player'
				})
				.append(player.name)
			)
			.click(function(e) {
				if (me.followingPlayer !== player) {
					me.followPlayer(null);
				}
				if(player.location.world)
					me.panToLocation(player.location);
			});
		player.menuname.data('sort', player.sort);
		// Inject into playerlist alphabetically
		var firstNodeAfter = me.playerlist.children().filter(function() {
		    var itm = $('a', this);
			var sort = itm.data('sort');
		    if (sort > player.sort) return true;
		    if (sort < player.sort) return false;
			return (itm.text().toLowerCase() > player.menuname.text().toLowerCase());
		}).eq(0);
		if (firstNodeAfter.length > 0) {
			firstNodeAfter.before(menuitem);
		} else {
			menuitem.appendTo(me.playerlist);
		}
		if (me.options.showplayerfacesinmenu) {
			getMinecraftHead(player.account, 16, function(head) {
				$('img', playerIconContainer).remove();
				$(head).appendTo(playerIconContainer);
			});
		}
	},
	updatePlayer: function(player, update) {
		var me = this;
		var location = player.location = new Location(me.worlds[update.world], parseFloat(update.x), parseFloat(update.y), parseFloat(update.z));
		player.health = update.health;
		player.armor = update.armor;
		player.name = update.name;

		$(me).trigger('playerupdated', [ player ]);

		if (player.menuname && (player.menuname.html() != player.name)) {
		    player.menuname.html(player.name);
		}
		
		// Update menuitem.
		if(me.options.grayplayerswhenhidden)
			player.menuitem.toggleClass('otherworld', me.world !== location.world);

		if (player === me.followingPlayer) {
			// Follow the updated player.
			me.panToLocation(player.location);
		}
	},
	removePlayer: function(player) {
		var me = this;

		delete me.players[player.account];

		$(me).trigger('playerremoved', [ player ]);

		// Remove menu item.
		player.menuitem.remove();
	},
	followPlayer: function(player) {
		var me = this;
		$('.following', me.playerlist).removeClass('following');

		if(player) {
			if(!player.location.world)
				return;
			$(player.menuitem).addClass('following');
			me.panToLocation(player.location, function() {
				if(me.options.followmap && me.world) {
					var pmap = me.world.maps[me.options.followmap];
					if(pmap)
						me.selectMapAndPan(pmap);
				}
				if(me.options.followzoom)
					me.map.setZoom(me.options.followzoom);
			});
		}
		this.followingPlayer = player;
	},
	updateBackground: function() {
		var me = this;
		var col = "#000000";
		if(me.serverday) {
			if(me.maptype.options.backgroundday)
				col = me.maptype.options.backgroundday;
			else if(me.maptype.options.background)
				col = me.maptype.options.background;
		}
		else {
			if(me.maptype.options.backgroundnight)
				col = me.maptype.options.backgroundnight;
			else if(me.maptype.options.background)
				col = me.maptype.options.background;
		}
		$('.map').css('background', col);
		$('.leaflet-tile').css('background', col);
	},
	getParameterByName: function(name) {
		name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
		var regexS = "[\\?&]"+name+"=([^&#]*)";
		var regex = new RegExp( regexS );
		var results = regex.exec( window.location.href );
		if( results == null )
			return "";
		else
			return decodeURIComponent(results[1].replace(/\+/g, " "));
	},
	getIntParameterByName: function(name) {
		var v = this.getParameterByName(name);
		if(v != "") {
			v = parseInt(v, 10);
			if(v != NaN) {
				return v;
				}
		}
		return null;
	},
	getBoolParameterByName: function(name) {
		var v = this.getParameterByName(name);
		if(v != "") {
			if(v == "true")
				return true;
			else if(v == "false")
				return false;
		}
		return null;
	},

	layersetlist: [],

	addToLayerSelector: function(layer, name, priority) {
		var me = this;

		if(me.options.showlayercontrol != "false" && (!me.layercontrol)) {
			me.layercontrol = new DynmapLayerControl();
			if(me.options.showlayercontrol == "pinned")
				me.layercontrol.options.collapsed = false;
			map.addControl(me.layercontrol);
		}

		var i;
		for(i = 0; i < me.layersetlist.length; i++) {
			if(me.layersetlist[i].layer === layer) {
				me.layersetlist[i].priority = priority;
				me.layersetlist[i].name = name;
				break;
			}
		}
		if(i >= me.layersetlist.length) {
			me.layersetlist[i] = { layer: layer, priority: priority, name: name };
		}
		me.layersetlist.sort(function(a, b) {
			if(a.priority != b.priority)
				return a.priority - b.priority;
			else
				return ((a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0));
		});
		if(me.options.showlayercontrol != "false") {
			for(i = 0; i < me.layersetlist.length; i++) {
				me.layercontrol.removeLayer(me.layersetlist[i].layer);
			}
			for(i = 0; i < me.layersetlist.length; i++) {
				me.layercontrol.addOverlay(me.layersetlist[i].layer, me.layersetlist[i].name);
			}
		}
	},
	removeFromLayerSelector: function(layer) {
		var me = this;
		var i;
		for(i = 0; i < me.layersetlist.length; i++) {
			if(me.layersetlist[i].layer === layer) {
				me.layersetlist.splice(i, 1);
				if(me.options.showlayercontrol != "false")
					me.layercontrol.removeLayer(layer);
				break;
			}
		}
	},
	getLink: function() {
		var me = this;
		var url = window.location.pathname;
		var center = me.maptype.getProjection().fromLatLngToLocation(me.map.getCenter(), 64);
		if(me.options['round-coordinates'])
			url = url + "?worldname=" + me.world.name + "&mapname=" + me.maptype.options.name + "&zoom=" + me.map.getZoom() + "&x=" + center.x + "&y=" +
				center.y + "&z=" + center.z;
		else
			url = url + "?worldname=" + me.world.name + "&mapname=" + me.maptype.options.name + "&zoom=" + me.map.getZoom() + "&x=" +
				Math.round(center.x) + "&y=" + Math.round(center.y) + "&z=" + Math.round(center.z);
		return url;
	},
	initLogin: function() {
		var me = this;
		if(!me.options['login-enabled'])
			return;

		var login = L.Control.extend({
			onAdd: function(map) {
				this._container = L.DomUtil.create('div', 'logincontainer');
				this._map = map;
				this._update();
				return this._container;
			},
			getPosition: function() {
				return 'bottomright';
			},
			getContainer: function() {
				return this._container;
			},
			_update: function() {
				if (!this._map) return;
				var c = this._container;
				var cls = 'loginbutton';
				if(me.options.sidebaropened != 'false') {
					cls = 'loginbutton pinnedloginbutton';
				}
				if (me.options.loggedin) {
					c = $('<button/>').addClass(cls).click(function(event) {
						$.ajax({
							type: 'POST',
		        				contentType: "application/json; charset=utf-8",
								url: config.url.login,
								success: function(response) {
									window.location = "index.html";
								}
						});
					}).text('Logout').appendTo(c)[0];
				}
				else {
					c = $('<button/>').addClass(cls).click(function(event) {
						me.saveURL();
						window.location = "login.html";
					}).text('Login').appendTo(c)[0];
				}
			}
		});
		var l = new login();
		me.map.addControl(l);
	},
	saveURL : function() {
		if(window.location.href.indexOf('?') > 0) {
			document.cookie="dynmapurl=" + escape(window.location);
		}
	},
	checkForSavedURL : function() {
		var i,x,y,ourcookies=document.cookie.split(";");
		for (i=0;i<ourcookies.length;i++) {
  			x=ourcookies[i].substr(0,ourcookies[i].indexOf("="));
  			y=ourcookies[i].substr(ourcookies[i].indexOf("=")+1);
			x=x.replace(/^\s+|\s+$/g,"");
  			if (x == "dynmapurl") {
  				var v = unescape(y);
  				document.cookie='dynmapurl=; expires=Thu, 01-Jan-70 00:00:01 GMT;';
  				if((v.indexOf('?') >= 0) && (v != window.location)) {
					window.location = v;
					return true;
				}
			}
		}
		return false;
    }
};
