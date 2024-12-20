/**
 * @name Emojis
 * @description Send emoji as link if it can't be sent it normally.
 * @version 1.0.3
 * @author Skamt
 * @website https://github.com/Skamt/BDAddons/tree/main/Emojis
 * @source https://raw.githubusercontent.com/Skamt/BDAddons/main/Emojis/Emojis.plugin.js
 */

const config = {
	"info": {
		"name": "Emojis",
		"version": "1.0.3",
		"description": "Send emoji as link if it can't be sent it normally.",
		"source": "https://raw.githubusercontent.com/Skamt/BDAddons/main/Emojis/Emojis.plugin.js",
		"github": "https://github.com/Skamt/BDAddons/tree/main/Emojis",
		"authors": [{
			"name": "Skamt"
		}]
	},
	"settings": {
		"sendDirectly": false,
		"ignoreEmbedPermissions": false,
		"shouldSendAnimatedEmojis": false,
		"sendEmojiAsPng": false,
		"shouldHihglightAnimatedEmojis": true,
		"emojiSize": 48
	}
}

const Api = new BdApi(config.info.name);

const UI = Api.UI;
const DOM = Api.DOM;
const Data = Api.Data;
const React = Api.React;
const Patcher = Api.Patcher;

const getModule = Api.Webpack.getModule;
const Filters = Api.Webpack.Filters;
const modules = Api.Webpack.modules;
const findInTree = Api.Utils.findInTree;

function getRawModule(filter, options) {
	let module;
	getModule((entry, m) => (filter(entry) ? (module = m) : false), options);
	return module;
}

function getModuleAndKey(filter, options) {
	let module;
	const target = getModule((entry, m) => (filter(entry) ? (module = m) : false), options);
	module = module?.exports;
	if (!module) return {};
	const key = Object.keys(module).find(k => module[k] === target);
	if (!key) return {};
	return { module, key };
}

function filterModuleAndExport(moduleFilter, exportFilter, options) {
	const module = getRawModule(moduleFilter, options);
	if (!module) return;
	const { exports } = module;
	const key = Object.keys(exports).find(k => exportFilter(exports[k]));
	if (!key) return {};
	return { module: exports, key, target: exports[key] };
}

const TheBigBoyBundle = getModule(Filters.byProps("openModal", "FormSwitch", "Anchor"), { searchExports: false });

function copy(data) {
	DiscordNative.clipboard.copy(data);
}

function getNestedProp(obj, path) {
	return path.split(".").reduce((ob, prop) => ob?.[prop], obj);
}

const nop = () => {};

const getZustand = (() => {
	let zustand = null;

	return function getZustand() {
		if (zustand !== null) return zustand;

		const filter = Filters.byStrings("useSyncExternalStoreWithSelector", "useDebugValue", "subscribe");
		let moduleId = null;
		for (const [id, loader] of Object.entries(modules)) {
			if (filter(loader.toString())) {
				moduleId = id;
				break;
			}
		}

		return (zustand = Object.values(getModule((_, __, id) => id === moduleId) || {})[0]);
	};
})();

const zustand = getZustand();
const SettingsStoreSelectors = {};
const persistMiddleware = config => (set, get, api) => config(args => (set(args), Data.save("settings", get().getRawState())), get, api);

const SettingsStore = Object.assign(
	zustand(
		persistMiddleware((set, get) => {
			const settingsObj = Object.create(null);

			for (const [key, value] of Object.entries({
					...config.settings,
					...Data.load("settings")
				})) {
				settingsObj[key] = value;
				settingsObj[`set${key}`] = newValue => set({
					[key]: newValue });
				SettingsStoreSelectors[key] = state => state[key];
			}
			settingsObj.getRawState = () => {
				return Object.entries(get())
					.filter(([, val]) => typeof val !== "function")
					.reduce((acc, [key, val]) => {
						acc[key] = val;
						return acc;
					}, {});
			};
			return settingsObj;
		})
	), {
		useSetting: function(key) {
			return this(state => [state[key], state[`set${key}`]]);
		},
		selectors: SettingsStoreSelectors
	}
);

Object.defineProperty(SettingsStore, "state", {
	writeable: false,
	configurable: false,
	get() {
		return this.getState();
	}
});

const Settings = SettingsStore;

const Switch = TheBigBoyBundle.FormSwitch ||
	function SwitchComponentFallback(props) {
		return (
			React.createElement('div', { style: { color: "#fff" }, }, props.children, React.createElement('input', {
				type: "checkbox",
				checked: props.value,
				onChange: e => props.onChange(e.target.checked),
			}))
		);
	};

function SettingSwtich({ settingKey, note, onChange = nop, hideBorder = false, description }) {
	const [val, set] = Settings.useSetting(settingKey);
	return (
		React.createElement(Switch, {
			value: val,
			note: note,
			hideBorder: hideBorder,
			onChange: e => {
				set(e);
				onChange(e);
			},
		}, description || settingKey)
	);
}

const { FormText, Slider, Heading } = TheBigBoyBundle;

const SettingComponent = () => {
	return (
		React.createElement(React.Fragment, null, [{
				description: "Send Directly",
				note: "Send the emoji link in a message directly instead of putting it in the chat box.",
				settingKey: "sendDirectly"
			},
			{
				description: "Ignore Embed Permissions",
				note: "Send emoji links regardless of embed permissions, meaning links will not turn into images.",
				settingKey: "ignoreEmbedPermissions"
			},
			{
				description: "Send animated emojis",
				note: "Animated emojis are sent as GIFs.",
				settingKey: "shouldSendAnimatedEmojis"
			},
			{
				description: "Send animated as png",
				note: "Meaning the emoji will show only the first frame, making them act as normal emoji, unless the first frame is empty.",
				settingKey: "sendEmojiAsPng"
			},
			{
				description: "Highlight animated emoji",
				settingKey: "shouldHihglightAnimatedEmojis"
			}
		].map(SettingSwtich), React.createElement(StickerSize, null))
	);
};

const emojiSizes = [48, 56, 60, 64, 80, 96, 100, 128, 160, 240, 256, 300];

function StickerSize() {
	const [val, set] = Settings.useSetting("emojiSize");

	return (
		React.createElement(React.Fragment, null, React.createElement(Heading, {
				style: { marginBottom: 20 },
				tag: "h5",
			}, "Emoji Size"

		), React.createElement(Slider, {
			className: "emojiSizeSlider",
			stickToMarkers: true,
			sortedMarkers: true,
			equidistant: true,
			markers: emojiSizes,
			minValue: emojiSizes[0],
			maxValue: emojiSizes[emojiSizes.length - 1],
			initialValue: val,
			onValueChange: e => set(emojiSizes.find(s => e <= s) ?? emojiSizes[emojiSizes.length - 1]),
		}), React.createElement(FormText, { type: "description", }, "The size of the Emoji in pixels"))
	);
}

const Logger = {
	error(...args) {
		this.p(console.error, ...args);
	},
	patch(patchId) {
		console.error(`%c[${config.info.name}] %c Error at %c[${patchId}]`, "color: #3a71c1;font-weight: bold;", "", "color: red;font-weight: bold;");
	},
	log(...args) {
		this.p(console.log, ...args);
	},
	p(target, ...args) {
		target(`%c[${config.info.name}]`, "color: #3a71c1;font-weight: bold;", ...args);
	}
};

const EmojiFunctions = getModule(Filters.byProps("getEmojiUnavailableReason"), { searchExports: true });

const EmojiIntentionEnum = getModule(Filters.byProps("GUILD_ROLE_BENEFIT_EMOJI"), { searchExports: true }) || {
	"CHAT": 3
};

const EmojiStore = getModule(m => m._dispatchToken && m.getName() === "EmojiStore");

const SelectedChannelStore = getModule(m => m._dispatchToken && m.getName() === "SelectedChannelStore");

const ChannelStore = getModule(m => m._dispatchToken && m.getName() === "ChannelStore");

const MessageActions = getModule(Filters.byProps('jumpToMessage', '_sendMessage'), { searchExports: false });

const Dispatcher = getModule(Filters.byProps("dispatch", "subscribe"), { searchExports: false });

const PendingReplyStore = getModule(m => m._dispatchToken && m.getName() === "PendingReplyStore");

function getReply(channelId) {
	const reply = PendingReplyStore?.getPendingReply(channelId);
	if (!reply) return {};
	Dispatcher?.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
	return {
		messageReference: {
			guild_id: reply.channel.guild_id,
			channel_id: reply.channel.id,
			message_id: reply.message.id
		},
		allowedMentions: reply.shouldMention ?
			undefined :
			{
				parse: ["users", "roles", "everyone"],
				replied_user: false
			}
	};
}

async function sendMessageDirectly(channel, content) {
	if (!MessageActions || !MessageActions.sendMessage || typeof MessageActions.sendMessage !== "function") throw new Error("Can't send message directly.");

	return MessageActions.sendMessage(
		channel.id, {
			validNonShortcutEmojis: [],
			content
		},
		undefined,
		getReply(channel.id)
	);
}

const insertText = (() => {
	let ComponentDispatch;
	return content => {
		if (!ComponentDispatch) ComponentDispatch = getModule(m => m.dispatchToLastSubscribed && m.emitter.listeners("INSERT_TEXT").length, { searchExports: true });
		if (!ComponentDispatch) return;
		setTimeout(() =>
			ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", {
				plainText: content
			})
		);
	};
})();

const DraftStore = getModule(m => m._dispatchToken && m.getName() === "DraftStore");

function showToast(content, type) {
	UI.showToast(`[${config.info.name}] ${content}`, { timeout: 5000, type });
}

const Toast = {
	success(content) { showToast(content, "success"); },
	info(content) { showToast(content, "info"); },
	warning(content) { showToast(content, "warning"); },
	error(content) { showToast(content, "error"); }
};

function getCustomEmojiById(id) {
	const emoji = EmojiStore.getCustomEmojiById(id);
	if (emoji) return emoji;
	const savedEmojis = Data.load("emojis");
	return savedEmojis.find(a => a.id === id);
}

function getEmojiUrl(id) {
	const { animated } = getCustomEmojiById(id) || { animated: false };
	const size = Settings.state.emojiSize;
	const asPng = Settings.state.sendEmojiAsPng;
	const type = animated ? (asPng ? "png" : "gif") : "png";

	return `https://cdn.discordapp.com/emojis/${id}.${type}${animated && !asPng ? "" : `?size=${size}`}`;
}

function sendEmojiAsLink(content, channel) {
	if (!channel) channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
	const draft = DraftStore.getDraft(channel.id, 0);
	if (draft) return insertText(`[󠇫](${content})`);

	if (Settings.state.sendDirectly) {
		try {
			return sendMessageDirectly(channel, content);
		} catch {
			Toast.error("Could not send directly.");
		}
	}
	insertText(content);
}

function sendEmojiDirectly(id) {
	const content = getEmojiUrl(id);
	sendEmojiAsLink(content);
}

function insertEmoji(id) {
	const content = getEmojiUrl(id);
	insertText(content);
}

const patchIsEmojiDisabled = () => {
	if (EmojiFunctions && EmojiFunctions.isEmojiDisabled)
		Patcher.after(EmojiFunctions, "isEmojiDisabled", (_, [{ intention }], ret) => {
			if (intention !== EmojiIntentionEnum.CHAT) return ret;
			return false;
		});
	else Logger.patch("IsEmojiDisabled");
};

const EmojiComponent = getModuleAndKey(Filters.byStrings("getDisambiguatedEmojiContext", "isFavoriteEmojiWithoutFetchingLatest", "allowAnimatedEmoji"));

const patchHighlightAnimatedEmoji = () => {
	const { module, key } = EmojiComponent;
	if (module && key)
		Patcher.after(module, key, (_, [{ descriptor }], ret) => {
			if (descriptor.emoji.animated && Settings.state.shouldHihglightAnimatedEmojis) ret.props.className += " animated";
		});
	else Logger.patch("HighlightAnimatedEmoji");
};

const Button = TheBigBoyBundle.Button ||
	function ButtonComponentFallback(props) {
		return React.createElement('button', { ...props, });
	};

/* eslint-disable react/jsx-key */

const MessageDecorations = filterModuleAndExport(Filters.byProps("OLD_MESSAGES"), Filters.byStrings(".popoutContainer"), { searchExports: true });
const AssetURLUtils = getModule(Filters.byProps("getEmojiURL"));

const patchEmojiUtils = () => {
	const { module, key } = MessageDecorations;
	if (!module || !key) return Logger.patch("patchEmojiUtils");
	Patcher.after(module, key, (_, __, ret) => {
		const { animated, emojiName, guildId = "", emojiId: id } = getNestedProp(ret, "props.children.0.props.children.0.props.children.0.props") || {};
		if (!id) return ret;

		const children = getNestedProp(ret, "props.children.0.props.children");
		if (!children) return ret;
		const btns = [
			React.createElement(Button, {
				size: Button.Sizes.SMALL,
				color: Button.Colors.GREEN,
				onClick: () => {
					const url = AssetURLUtils.getEmojiURL({ id });
					if (!url) return Toast.error("no url found");
					copy(url);
					Toast.success("Copid");
				},
			}, "Copy"),
			React.createElement(Button, {
				size: Button.Sizes.SMALL,
				color: Button.Colors.GREEN,
				onClick: () => {
					try {
						const emojis = Data.load("emojis") || [];
						emojis.unshift({
							animated,
							id,
							guildId,
							name: emojiName.replace(/:/gi, ""),
							allNamesString: emojiName,
							available: true,
							managed: false,
							require_colons: true,
							url: `https://cdn.discordapp.com/emojis/${id}.webp?size=4096&quality=lossless`,
							type: "GUILD_EMOJI"
						});
						Data.save("emojis", emojis);
						Toast.success("Saved.");
					} catch {
						Toast.error("Could not save.");
					}
				},
			}, "Save")
		];
		const d = findInTree(ret, a => a?.expressionSourceGuild, { walkable: ["props", "children"] });
		if (d)
			btns.push(
				React.createElement(Button, {
					style: { flexGrow: 1 },
					size: Button.Sizes.SMALL,
					color: Button.Colors.GREEN,
					onClick: () => {
						try {
							const emojis = Data.load("emojis") || [];
							emojis.unshift(...d.expressionSourceGuild.emojis.map(a => {
								return {
									...a,
									guildId: "",
									allNamesString: `:${a.name}:`
								}
							}));
							Data.save("emojis", emojis);
							Toast.success("Saved.");
						} catch {
							Toast.error("Could not save.");
						}
					},
				}, `Save all ${d?.expressionSourceGuild?.emojis?.length || 0} emojis`)
			);

		children.push(React.createElement('div', { className: "emojiControls", }, btns));
	});
};

const emojiContextConstructor = EmojiStore?.getDisambiguatedEmojiContext?.().constructor;

const patchFavoriteEmojis = () => {
	if (!emojiContextConstructor) return Logger.patch("emojiContextConstructor");

	Patcher.after(emojiContextConstructor.prototype, "rebuildFavoriteEmojisWithoutFetchingLatest", (_, args, ret) => {
		if (!ret?.favorites) return;
		const emojis = Data.load("emojis");
		ret.favorites = [...ret.favorites, ...emojis];
	});

	Patcher.after(emojiContextConstructor.prototype, "getDisambiguatedEmoji", (_, args, ret) => {
		const emojis = Data.load("emojis");
		let sum = [];
		if (emojis.length > ret.length) {
			sum = [...emojis];
			ret.forEach(r => (emojis.find(e => e.id === r.id) ? null : sum.push(r)));
		} else {
			sum = [...ret];
			emojis.forEach(r => (ret.find(e => e.id === r.id) ? null : sum.push(r)));
		}

		return sum;
	});
};

/* eslint-disable react/jsx-key */

const { MenuItem } = TheBigBoyBundle;
const bbb = getModule(Filters.byStrings("unfavorite"), { defaultExport: false });

const patchEmojiContextMenu = () => {
	if (!bbb?.Z) return Logger.patch("patchUnfavoriteEmoji");
	Patcher.after(bbb, "Z", (_, args, ret) => {
		const [{ type, isInExpressionPicker, id }] = args;
		if (type !== "emoji" || !isInExpressionPicker || !id) return;
		console.log(_, args, ret);
		return [
			React.createElement(MenuItem, {
				action: () => sendEmojiDirectly(id),
				id: "send-directly",
				label: "send directly",
			}),
			React.createElement(MenuItem, {
				action: () => insertEmoji(id),
				id: "insert-url",
				label: "insert url",
			}),
			ret
		];

	});
};

class Emojis {
	start() {
		try {
			DOM.addStyle(css);

			patchIsEmojiDisabled();
			patchHighlightAnimatedEmoji();
			patchEmojiUtils();
			patchFavoriteEmojis();

			patchEmojiContextMenu();
		} catch (e) {
			console.error(e);
		}
	}

	stop() {
		DOM.removeStyle();
		Patcher.unpatchAll();
	}

	getSettingsPanel() {
		return React.createElement(SettingComponent, null);
	}
}

module.exports = Emojis;

const css = `.CHAT .premiumPromo-1eKAIB {
	display: none;
}
.emojiItemDisabled-3VVnwp {
	filter: unset;
}

.emojiControls {
	display: flex;
	justify-content: flex-end;
	gap: 4px;
	margin-top: 5px;
}
.emojiSizeSlider {
	line-height: 1;
}


`;
