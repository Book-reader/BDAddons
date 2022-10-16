/**
 * @name FreeStickers
 * @description Enables you to send custom Stickers without nitro as links, (custom stickers as in the ones that are added by servers, not official discord stickers).
 * @version 2.0.3
 * @author Skamt
 * @website https://github.com/Skamt/BDAddons/tree/main/FreeStickers
 * @source https://raw.githubusercontent.com/Skamt/BDAddons/main/FreeStickers/FreeStickers.plugin.js
 */
const config = {
	info: {
		name: "FreeStickers",
		version: "2.0.3",
		description: "Enables you to send custom Stickers without nitro as links, (custom stickers as in the ones that are added by servers, not official discord stickers).",
		source: "https://raw.githubusercontent.com/Skamt/BDAddons/main/FreeStickers/FreeStickers.plugin.js",
		github: "https://github.com/Skamt/BDAddons/tree/main/FreeStickers",
		authors: [{
			name: "Skamt"
		}]
	},
	changelog: [{
		title: "Feature",
		type: "added",
		items: ["Support for Sticker suggestions is back."]
	}],
	defaultConfig: [{
		type: "switch",
		id: "sendDirectly",
		name: "Send Directly",
		note: "Send the sticker link in a message directly instead of putting it in the chat box.",
		value: false
	}, {
		type: "switch",
		id: "ignoreEmbedPermissions",
		name: "Ignore Embed Permissions",
		note: "Send sticker links regardless of embed permissions, meaning links will not turn into images.",
		value: false
	}, {
		type: "switch",
		id: "shouldSendAnimatedStickers",
		name: "Send animated stickers",
		note: "Animated stickers do not animate, sending them will only send the first picture of the animation. (still useful)",
		value: false
	}, {
		type: "switch",
		id: "shouldHighlightAnimated",
		name: "Highlight animated stickers",
		value: true
	}, {
		type: "slider",
		id: "stickerSize",
		name: "Sticker Size",
		note: "The size of the sticker in pixels. 160 is recommended.",
		value: 160,
		markers: [20, 32, 48, 60, 80, 100, 128, 160],
		stickToMarkers: true
	}]
};
class MissinZeresPluginLibraryClass {
	constructor() { this.config = config; }
	load() {
		BdApi.showConfirmationModal('Library plugin is needed',
			[`**ZeresPluginLibrary** is needed to run **${this.config.info.name}**.`, `Please download it from the officiel website`, 'https://betterdiscord.app/plugin/ZeresPluginLibrary'], {
				confirmText: 'Ok'
			});
	}
	start() {}
	stop() {}
}

function initPlugin([Plugin, Api]) {
	const plugin = (Plugin, Api) => {
		const { Filters, getModule } = BdApi.Webpack;
		const {
			Logger,
			Toasts,
			Patcher,
			Utilities,
			PluginUtilities,
			DiscordModules: {
				Permissions,
				UserStore,
				ChannelStore,
				DiscordPermissions,
				MessageActions
			}
		} = Api;
		// Modules
		let StickersSendabilityEnumKey, getStickerSendabilityKey, isSendableStickerKey;
		const StickersSendability = getModule(exp => {
			const keys = Object.keys(exp);
			if (keys.some(key => exp[key].SENDABLE_WITH_BOOSTED_GUILD)) {
				StickersSendabilityEnumKey = keys.find(key => exp[key].SENDABLE_WITH_BOOSTED_GUILD);
				getStickerSendabilityKey = keys.find(key => exp[key].toString().includes('SENDABLE_WITH_PREMIUM'));
				isSendableStickerKey = keys.find(key => !exp[key].toString().includes('SENDABLE_WITH_PREMIUM') && !exp[key].SENDABLE_WITH_BOOSTED_GUILD);
				return true;
			}
		});
		const ChannelTextArea = getModule((exp) => exp.type.render.toString().includes('CHANNEL_TEXT_AREA'));
		const StickerStore = getModule(Filters.byProps("getStickerById"), { searchExports: true });
		const StickerTypeEnum = getModule(Filters.byProps("GUILD", "STANDARD"), { searchExports: true });
		const StickerFormatEnum = getModule(Filters.byProps("APNG", "LOTTIE"), { searchExports: true });
		const StickersSendabilityEnum = StickersSendability[StickersSendabilityEnumKey];
		const getStickerSendability = StickersSendability[getStickerSendabilityKey];;
		const InsertText = (() => {
			let ComponentDispatch;
			return (content) => {
				if (!ComponentDispatch) ComponentDispatch = getModule(m => m.dispatchToLastSubscribed && m.emitter.listeners("INSERT_TEXT").length, { searchExports: true });
				setTimeout(() => {
					ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", {
						plainText: content,
						rawText: content
					});
				}, 0)
			}
		})();
		// Strings & Constants
		const TAGS = {
			ANIMATED_STICKER_TAG: "ANIMATED_STICKER_TAG"
		};
		const STRINGS = {
			sendLottieStickerErrorMessage: "Official Discord Stickers are not supported.",
			missingEmbedPermissionsErrorMessage: "Missing Embed Permissions",
			disabledAnimatedStickersErrorMessage: "You have disabled animated stickers in settings."
		};
		// Helper functions
		const Utils = {
			isTagged: (str) => Object.values(TAGS).some(tag => str.includes(tag)),
			showToast: (content, type) => Toasts[type](`[${config.info.name}] ${content}`),
			getStickerUrl: (stickerId, size) => `https://media.discordapp.net/stickers/${stickerId}.webp?passthrough=false&quality=lossless&size=${size}`,
			hasEmbedPerms: (channel, user) => !channel.guild_id || Permissions.can({ permission: DiscordPermissions.EMBED_LINKS, context: channel, user }),
			updateStickers: () => StickerStore.stickerMetadata.forEach((value, key) => StickerStore.getStickerById(key)),
			isLottieSticker: sticker => sticker.type === StickerTypeEnum.STANDARD,
			isAnimatedSticker: sticker => sticker["format_type"] === StickerFormatEnum.APNG,
			isStickerSendable: (sticker, channel, user) => getStickerSendability(sticker, user, channel) === StickersSendabilityEnum.SENDABLE,
		};
		// styles
		const css = `/* Highlight animated stickers */
.stickerAsset-4c7Oqy[alt$="ANIMATED_STICKER_TAG"]{
	padding:1px;
    border-radius: 12px;
    box-sizing:border-box;
    border: 2px dotted #ff8f09;
}
`;
		return class FreeStickers extends Plugin {
			constructor() {
				super();
			}
			handleUnsendableSticker({ user, sticker, channel }, direct) {
				if (Utils.isAnimatedSticker(sticker) && !this.settings.shouldSendAnimatedStickers)
					return Utils.showToast(STRINGS.disabledAnimatedStickersErrorMessage, "info");
				if (!Utils.hasEmbedPerms(channel, user) && !this.settings.ignoreEmbedPermissions)
					return Utils.showToast(STRINGS.missingEmbedPermissionsErrorMessage, "info");
				this.sendStickerAsLink(sticker, channel, direct);
			}
			sendStickerAsLink(sticker, channel, direct) {
				if (this.settings.sendDirectly || direct)
					MessageActions.sendMessage(channel.id, {
						content: Utils.getStickerUrl(sticker.id, this.settings.stickerSize),
						validNonShortcutEmojis: []
					});
				else
					InsertText(Utils.getStickerUrl(sticker.id, this.settings.stickerSize));
			}
			handleSticker(channelId, stickerId) {
				const user = UserStore.getCurrentUser();
				const sticker = StickerStore.getStickerById(stickerId);
				const channel = ChannelStore.getChannel(channelId);
				return {
					user,
					sticker,
					channel,
					isSendable: Utils.isStickerSendable(sticker, channel, user)
				}
			}
			patchSendSticker() {
				/** 
				 * The existance of this plugin implies the existance of this patch 
				 */
				Patcher.instead(MessageActions, 'sendStickers', (_, args, originalFunc) => {
					const [channelId, [stickerId]] = args;
					const stickerObj = this.handleSticker(channelId, stickerId);
					if (stickerObj.isSendable)
						originalFunc.apply(_, args)
					else
						this.handleUnsendableSticker(stickerObj);
				});
			}
			patchStickerAttachement() {
				/** 
				 * Since we enabled stickers to be clickable
				 * If you click on a sticker while the textarea has some text
				 * the sticker will be added as attachment, and therefore triggers an api request
				 * must intercept and send as link
				 */
				Patcher.before(MessageActions, 'sendMessage', (_, args) => {
					const [channelId, , , attachments] = args;
					if (attachments && attachments.stickerIds && attachments.stickerIds.filter) {
						const [stickerId] = attachments.stickerIds;
						const stickerObj = this.handleSticker(channelId, stickerId);
						if (!stickerObj.isSendable) {
							args[3] = {};
							setTimeout(() => {
								this.handleUnsendableSticker(stickerObj, true);
							}, 0)
						}
					}
				})
			}
			patchChannelTextArea() {
				/** 
				 * this patch is for adding a local permission override to the current channel
				 * so that stickers show up in the picker. in channels that disable external stickers
				 * While this may feel like a feature bypass, I believe if a sticker is posted as an image, 
				 * it's no longer a sticker anymore.

				 * 262144n is for Sending external Emojis permission
				 * which is what's needed to let stickers show up in the picker. ¯\_(ツ)_/¯
				 */
				Patcher.before(ChannelTextArea.type, "render", (_, [{ channel }]) => {
					const userId = UserStore.getCurrentUser().id;
					channel.permissionOverwrites[userId] = {
						id: userId,
						type: 1,
						allow: 262144n,
						deny: 0n
					};
				});
			}
			patchStickerClickability() {
				// if it's a guild sticker return true to make it clickable 
				// ignoreing discord's stickers because ToS, and they're not regular images
				Patcher.after(StickersSendability, isSendableStickerKey, (_, args, returnValue) => {
					return args[0].type === StickerTypeEnum.GUILD;
				});
			}
			patchGetStickerById() {
				/** 
				 * this patch is for adding a tag to animated stickers
				 * to style highlight them if setting is set to true
				 * the sticker description gets added to the alt DOM attributes
				 */
				Patcher.after(StickerStore, "getStickerById", (_, args, sticker) => {
					if (!sticker) return;
					if (!Utils.isTagged(sticker.description || "") && !Utils.isLottieSticker(sticker) && Utils.isAnimatedSticker(sticker) && this.settings.shouldHighlightAnimated)
						sticker.description += TAGS.ANIMATED_STICKER_TAG;
					else if (!this.settings.shouldHighlightAnimated)
						sticker.description = sticker.description.replace(TAGS.ANIMATED_STICKER_TAG, "");
				});
			}
			patchStickerSuggestion() {
				// Enable suggestions for custom stickers only 
				Patcher.after(StickersSendability, getStickerSendabilityKey, (_, args, returnValue) => {
					if (args[0].type === StickerTypeEnum.GUILD) {
						const { SENDABLE } = StickersSendabilityEnum;
						return returnValue !== SENDABLE ? SENDABLE : returnValue;
					}
				});
			}
			onStart() {
				try {
					PluginUtilities.addStyle(this.getName(), css);
					this.patchStickerClickability();
					this.patchSendSticker();
					this.patchGetStickerById();
					this.patchStickerAttachement();
					this.patchStickerSuggestion();
					this.patchChannelTextArea();
				} catch (e) {
					Logger.err(e);
				}
			}
			onStop() {
				PluginUtilities.removeStyle(this.getName());
				Patcher.unpatchAll();
			}
			getSettingsPanel() {
				const panel = this.buildSettingsPanel();
				panel.addListener((id, checked) => {
					if (id === "shouldHighlightAnimated")
						Utils.updateStickers();
				});
				return panel.getElement();
			}
		};
	};
	return plugin(Plugin, Api);
}
module.exports = !global.ZeresPluginLibrary ? MissinZeresPluginLibraryClass : initPlugin(global.ZeresPluginLibrary.buildPlugin(config));
