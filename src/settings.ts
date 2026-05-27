/** What the plugin does to outgoing links when a note is moved to a folder
 *  with a different effective link style. */
export type OnMoveAction = 'ask' | 'always' | 'never';

export interface PluginSettings {
	onMove: OnMoveAction;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	onMove: 'ask',
};
