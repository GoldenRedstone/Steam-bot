const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');
const fs = require('fs');

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
	steam: client,
	community: community,
	language: 'en'
});

// client.setOption('promptSteamGuardCode', false)

const config = require('./config.json');
const prices = require('./prices.json');
const messages = require('./messages.json');

const logOnOptions = {
	accountName: config.username,
	password: config.password,
	twoFactorCode: SteamTotp.generateAuthCode(config.sharedSecret)
}

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

	if (content == "quit") {
		// throw new Error();
		console.log(typeof(sid))
		if (sid == config.ownerID) {
			client.chatMessage(sid, "logging off");
			console.log("--logging off--");
			client.logOff()
		} else {
			client.chatMessage(sid, messages.attemptedShutdown);
			console.log(" Someone tried to quit "+sid);
		}

	} else if (content in messages.basic) {
		client.chatMessage(sid, messages.basic[content]);
		console.log(" We said '"+messages.basic[content])

	} else if (config.upcomingFeatures.includes(content)) {
		client.chatMessage(sid, messages.upcomingFeature);
		console.log(" Upcoming feature '"+content+"' hinted to")

	} else if (content == "value") {
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
	} else if (content == "writetest") {
		fs.appendFile('input.txt', 'Simply Easy Learning!', (err) => {manageError(err)});
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
client.on('websession', (sessionid, cookies) => {
	manager.setCookies(cookies);
	community.setCookies(cookies);

	community.startConfirmationChecker(20000, config.identitySecret);
})
function acceptOffer(offer) {
	offer.accept((err) => {
		community.checkConfirmations();
		console.log(" We accepted an offer")
		if (err) console.log("! There was an error accepting offer");
	});
	// console.log("Recived items")
	// offer.getRecivedItems((items) => {
	// 	for (i in items) {
	// 		console.log(i);
	// 	}
	// })
}
function declineOffer(offer) {
	offer.decline((err) => {
		if (err) console.log("! There was an error delining offer");
		console.log(" We declined an offer")
	});
}
function processOffer(offer) {
	if (offer.isGlitched || offer.state == 11){
		console.log("> Offer is glitched")
		declineOffer(offer);
	} else if (offer.partner.getSteamID64() == config.ownerID){
		console.log("> Admin offer")
		acceptOffer(offer);
		client.chatMessage(sid, messages.trade.adminTrade);

	} else if (offer.itemsToGive.length <= 0) {
		console.log("> Someone is donating to us")
		acceptOffer(offer);
		client.chatMessage(sid, messages.trade.donation);
	} else if (offer.itemsToRecieve.length <= 0) {
		console.log("> Someone is stealing from us")
		declineOffer(offer);
		client.chatMessage(sid, messages.trade.stealing);

	} else {
		console.log("> Trade started!")
		var giveValue = 0;
		var recieveValue = 0;

		for (var i in offer.itemsToGive){
			var item = offer.itemsToGive[i].market_name;
			if (prices[item]) {
				giveValue += prices[item].selling;
			} else {
				console.log("! Invalid giving item: '"+item+"'")
				giveValue += 9999;
				client.chatMessage(sid, messages.trade.notGiving);
				client.chatMessage(sid, item)
			}
		}
		for (var i in offer.itemsToRecieve){
			var item = offer.itemsToRecieve[i].market_name;
			if (prices[item]) {
				recieveValue += prices[item].buying;
			} else {
				console.log("! Invalid reciving item: '"+item+"'")
				client.chatMessage(sid, messages.trade.notReciving);
				client.chatMessage(sid, item)
			}
		}
		console.log(" = giveValue: '"+giveValue+"'")
		console.log(" = recieveValue: '"+recieveValue+"'")
		if (recieveValue >= giveValue) {
			console.log("> Sufficient offer")
			acceptOffer(offer);
			client.chatMessage(sid, messages.trade.sufficient);
		} else {
			console.log("> Insufficient offer")
			declineOffer(offer);
			client.chatMessage(sid, messages.trade.insufficient);
		}
	}
}
manager.on('newOffer', (offer) => {
	console.log("")
	console.log("-- We recieved a new offer --");
	offer.getUserDetails((callback) => {
		console.log(callback.them.personaName)
	});
	console.log(offer.message)
	processOffer(offer);
})


// community.login(logOnOptions, );

// community.on('log on', () => {

// })

// steamMarketSell.getPrice('Chroma 3 Case', true, (err, price) => {
//     if (err) console.log(err);
//     else priceOfChroma = price;
// });
// steamMarketSell.on('item sold', (info) => {
//     console.log(info)
// })
// steamMarketSell.on('item not sold', (info) => {
//     console.log('not sold');
//     console.log(info)
// })
