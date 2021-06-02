const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');
const fs = require('fs');

const config = require('./config.json');
const prices = require('./prices.json');
const messages = require('./messages.json');

let client = new SteamUser();
let community = new SteamCommunity();
let manager = new TradeOfferManager({
	"steam": client,
	"community":community,
	"language": "en"
});


// client.setOption('promptSteamGuardCode', false)

let logOnOptions = {
	"accountName": config.username,
	"password": config.password,
	"twoFactorCode": SteamTotp.getAuthCode(config.sharedSecret)
};

client.logOn(logOnOptions);



function manageError(err) {
	if (err) {
		throw err;
	}
}

function printName(err, personas, sid) {
	manageError(err)
	persona = personas[sid.getSteamID64()];
    name = persona ? persona.player_name : ("[" + sid.getSteamID64() + "]");
    console.log(" ="+name);
}

function logName(err, personas, sid, file) {
	persona = personas[sid.getSteamID64()];
    name = persona ? persona.player_name : ("[" + sid.getSteamID64() + "]");
    fs.appendFile('messages.txt', name+"\n", (err) => {manageError(err)});
}

// Start up messages
client.on('loggedOn', () => {
	console.log("Logged On");
	client.setPersona(SteamUser.EPersonaState.Online);
	if (config.onlineMode) {client.gamesPlayed(440)}
});

client.on('webSession', function(sessionID, cookies) {
	manager.setCookies(cookies, function(err) {
		if (err) {
			console.log(err);
			process.exit(1); // Fatal error since we couldn't get our API key
			return;
		}

		console.log("Got API key: " + manager.apiKey);
	});

	community.setCookies(cookies);

});

client.on('newItems', (count) => {
	console.log("= New Items since last manual update: "+count);
});
client.on('newComments', (count, myItems, discussions) => {
	console.log("= New Comments since last manual update: "+count);
});
client.on('offlineMessages', (count, friends) => {
	if (count > 0) {
		console.log("= New Messages since last manual update: "+count);
	}
});


// Friends
client.on('friendMessage', function(sid, message) {
	console.log("");
	console.log("-- Message recived --");
	client.getPersonas([sid], (err,personas) => {printName(err, personas, sid)});
	client.getPersonas([sid], (err,personas) => {logName(err, personas, sid, "messages.txt")});
	fs.appendFile('messages.txt', message+"\n", (err) => {manageError(err)})

	content = message.toLowerCase().replace("!","")

	if (content.startsWith("quit")) {
		throw new Error();
		// console.log(typeof(sid))
		// if (sid == config.ownerID) {
		// 	client.chatMessage(sid, "logging off");
		// 	console.log("--logging off--");
		// 	client.logOff()
		// } else {
		// 	client.chatMessage(sid, messages.attemptedShutdown);
		// 	console.log(" Someone tried to quit "+sid);
		// }

	} else if (content in messages.basic) {
		client.chatMessage(sid, messages.basic[content]);
		console.log(" We said '"+messages.basic[content])

	} else if (config.upcomingFeatures.includes(content)) {
		client.chatMessage(sid, messages.upcomingFeature);
		console.log(" Upcoming feature '"+content+"' hinted to")

	} else if (content.startsWith("help")) {
		response = ""
		for (command in messages.help) {
			response += " - "
			response += command
			response += "  -  "
			response += messages.help[command]
			response += "\n"
		}
		client.chatMessage(sid, response);

	} else if (content.startsWith("valuemyinv")) {
		community.getUserInventoryContents(sid, 440, 2, true, (err, inventory, currency, totalItems) => {
			manageError(err)
			var value = 0
			for (i in inventory) {
				var item = inventory[i]
				// console.log("  "+item["id"])
				if (item["market_name"] in prices && item["tradable"] ) {
					value += prices[item["market_name"]].buy
					console.log("- "+item["market_name"])
				}
			}
			// console.log(totalItems)
			console.log(value)
			// client.chatMessage(sid, "total number of TF2 items: "+totalItems);
			client.chatMessage(sid, messages.value+Math.round((value/9)*100)/100+"ref");
		})

	} else if (content.startsWith("prices")) {
		item = content.replace("prices ","")
		response = ""
		if (item == "buy") {
			for (i in prices) {
				response += " - " + i + " - "
				response += Math.round((prices[i]["buy"]/9)*100)/100
				response += "ref \n"
			}
		} else if (item == "sell") {
			for (i in prices) {
				response += " - " + i + " - "
				response += Math.round((prices[i]["sell"]/9)*100)/100
				response += "ref \n"
			}
		} else if (message.replace("!prices ","") in prices){
			response += message.replace("!prices ","")
			response += "\n"
			response += "buy - "
			response += prices[message.replace("!prices ","")]["buy"]
			response += "\n"
			response += "sell - "
			response += prices[message.replace("!prices ","")]["sell"]
			response += "\n"
		} else {
			response = "Invalid item or command"
		}
		client.chatMessage(sid, response);

	} else if (content == "promoted") {
		client.chatMessage(sid,
			messages.promotedPrefix + messages.promoted);

	} else if (content == "writetest") {
		fs.appendFile('input.txt', 'Simply Easy Learning!',
			(err) => {manageError(err)});

	} else if (content.startsWith("[tradeoffer")) {
		return;

	} else {
		console.log("! Invalid command: '"+content+"'");
	}
});

client.on('friendRelationship', function(sid, relationship) {
	if (relationship == SteamUser.EFriendRelationship.RequestRecipient) {
		console.log("-- We recived a friend request from "+sid)
		client.addFriend(sid, function(err, name) {
			manageError(err)
			console.log(" Accepted user "+name);
			client.chatMessage(sid, messages.added);
			client.chatMessage(sid, messages.promotedPrefix + messages.promoted);
		});

	} else if (relationship == SteamUser.EFriendRelationship.Friend) {
		console.log("-- We are now friends with "+sid)
		client.getPersonas([sid], (err, personas) => {printName(err, personas, sid)});

	} else {
		console.log("-- Relationship with "+sid+" updated to "+relationship)
		client.getPersonas([sid], (err, personas) => {printName(err, personas, sid)});
	}
	// if unfriended
});


// Trading
function declineOffer(offer) {
	offer.decline((err) => {
		if (err) console.log(err);
		console.log(" We declined an offer")
	});
}
function acceptOffer(offer) {
	offer.accept((err) => {
		if (err) console.log(err);
		console.log(" We accepted an offer")
	});
}
function processOffer(offer) {
	console.log(offer.partner.getSteamID64());
	console.log(offer.partner);
	// if (offer.isGlitched){
	// 	console.log("> Offer is glitched")
	// 	declineOffer(offer);
	if (offer.partner.getSteamID64() == config.ownerID){
		console.log("> Admin offer")
		acceptOffer(offer);
		client.chatMessage(offer.partner.getSteamID64(), messages.trade.adminTrade);

	} else if (offer.itemsToGive.length <= 0) {
		console.log("> Someone is donating to us")
		acceptOffer(offer);
		client.chatMessage(offer.partner.getSteamID64(), messages.trade.donation);
	} else if (offer.itemsToReceive.length <= 0) {
		console.log("> Someone is stealing from us")
		declineOffer(offer);
		client.chatMessage(offer.partner.getSteamID64(), messages.trade.stealing);

	} else {
		console.log("> Trade started!")
		var giveValue = 0;
		var receiveValue = 0;

		for (var i in offer.itemsToGive){
			var item = offer.itemsToGive[i].market_name;
			if (prices[item]) {
				giveValue += prices[item].sell;
			} else {
				console.log("! Invalid giving item: '"+item+"'")
				giveValue += 9999;
				client.chatMessage(offer.partner.getSteamID64(), messages.trade.notGiving);
				client.chatMessage(offer.partner.getSteamID64(), item)
			}
		}
		for (var i in offer.itemsToReceive){
			var item = offer.itemsToReceive[i].market_name;
			if (prices[item]) {
				receiveValue += prices[item].buy;
			} else {
				console.log("! Invalid reciving item: '"+item+"'")
				client.chatMessage(offer.partner.getSteamID64(), messages.trade.notReciving);
				client.chatMessage(offer.partner.getSteamID64(), item)
			}
		}
		console.log(" = giveValue: '"+giveValue+"'")
		console.log(" = receiveValue: '"+receiveValue+"'")
		if (receiveValue >= giveValue) {
			console.log("> Sufficient offer")
			acceptOffer(offer);
			client.chatMessage(offer.partner.getSteamID64(), messages.trade.sufficient);
		} else {
			console.log("> Insufficient offer")
			declineOffer(offer);
			client.chatMessage(offer.partner.getSteamID64(), messages.trade.insufficient);
		}
	}
}

manager.on('newOffer', (offer) => {
	console.log("")
	console.log("-- We received a new offer --");
	// offer.getUserDetails((callback) => {
	// 	console.log(callback.them.personaName)
	// });
	console.log(offer.message)
	processOffer(offer);
});



