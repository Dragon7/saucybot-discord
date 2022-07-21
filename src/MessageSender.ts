import {
    Message,
    MessageOptions,
    AttachmentPayload,
    CommandInteraction,
    InteractionReplyOptions,
} from 'discord.js';
import { MAX_EMBEDS_PER_MESSAGE, MAX_FILESIZE } from './Constants';
import Logger from './Logger';
import ProcessResponse from './sites/ProcessResponse';

class MessageSender {
    async send(
        received: Message | CommandInteraction,
        response: ProcessResponse
    ): Promise<void> {
        let messages: MessageTypes = [];

        // Pattern matching on a budget
        switch (true) {
            case response.embeds.length > 1:
                messages = await this.handleMultipleEmbeds(response);
                break;
            case response.embeds.length == 1:
                messages = await this.handleSingleEmbed(response);
                break;
            case response.files.length >= 1:
                messages = await this.handleFiles(response);
                break;
            default:
                messages = [response.text ?? ''];
                break;
        }

        for (const message of messages) {
            try {
                if (received instanceof Message) {
                    await received.reply(message);
                }

                // We use followUp as this is the only way to add multiple replies
                // to the original interaction unfortunately, far less intuitive, but it works
                if (received instanceof CommandInteraction) {
                    await received.followUp(message);
                }
            } catch (ex) {
                Logger.error(
                    ex.message,
                    `Shard ${received.client.shard?.ids?.[0] ?? 0}`
                );
            }
        }

        return Promise.resolve();
    }

    /**
     * When no embeds are detected but there are files
     */
    private async handleFiles(
        response: ProcessResponse
    ): Promise<MessageTypes> {
        const messages: MessageTypes = [];

        if (response.text) {
            messages.push(response.text);
        }

        // If we only have a single file, may as well push it and bail early to save cycles
        if (response.files.length == 1) {
            messages.push({
                files: response.files,
            });

            return messages;
        }

        // We split up file messages into groups of files under the file size limit
        // This is faster than sending the images back one-by-one

        const segments: AttachmentPayload[][] = [];

        for (const file of response.files) {
            if (segments.length === 0) {
                segments.push([file]);
                continue;
            }

            const index = segments.length - 1;

            const totalSize: number = segments[index].reduce((total, item) => {
                const attachment = item.attachment as Buffer;
                return total + attachment.length;
            }, 0);

            const attachment = file.attachment as Buffer;

            // If we're about to reach maximum message size, move onto the next index
            // If we've reached the end of the array, add a new item to the array as well
            if (attachment.length + totalSize >= MAX_FILESIZE) {
                segments.push([file]);
                continue;
            }

            // If we've not reached the maximum message size, add to the current index
            segments[index].push(file);
        }

        for (const files of segments) {
            messages.push({
                files: files,
            });
        }

        return Promise.resolve(messages);
    }

    /**
     * When only a single embed is detected
     */
    private async handleSingleEmbed(
        response: ProcessResponse
    ): Promise<MessageTypes> {
        const messages: MessageTypes = [];

        const embed = response.embeds.find((x) => x !== undefined);

        if (!embed) {
            messages.push({
                content: response.text,
            });

            return Promise.resolve(messages);
        }

        const embedUrls: string[] = [];

        if (embed.data?.image?.url) {
            embedUrls.push(embed.data.image.url.replace('attachment://', ''));
        }

        if (embed.data?.video?.url) {
            embedUrls.push(embed.data.video.url.replace('attachment://', ''));
        }

        // Only send attachments that are related to this embed
        const files = response.files.filter(
            (item) => item.name && embedUrls.includes(item.name)
        );

        messages.push({
            embeds: [embed],
            files: files,
            content: response.text,
        });

        return Promise.resolve(messages);
    }

    /**
     * When multiple embeds are detected
     */
    private async handleMultipleEmbeds(
        response: ProcessResponse
    ): Promise<MessageTypes> {
        const messages: MessageTypes = [];

        if (response.text) {
            messages.push(response.text);
        }

        // Chunk up embeds into maximum 4 per message
        for (
            let i = 0;
            i < response.embeds.length;
            i += MAX_EMBEDS_PER_MESSAGE
        ) {
            const chunk = response.embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE);
            let files: AttachmentPayload[] = [];

            // Find attachments related to these embeds
            for (const embed of chunk) {
                const embedUrls: string[] = [];

                if (embed.data.image?.url) {
                    embedUrls.push(
                        embed.data.image.url.replace('attachment://', '')
                    );
                }

                if (embed.data.video?.url) {
                    embedUrls.push(
                        embed.data.video.url.replace('attachment://', '')
                    );
                }

                const embedFiles = response.files.filter(
                    (item) => item.name && embedUrls.includes(item.name)
                );

                files = files.concat(embedFiles);
            }

            messages.push({
                embeds: chunk,
                files: files,
            });
        }

        return Promise.resolve(messages);
    }
}

/**
 * An amalgamation of all types that can be used to send messages to a channel
 */
type MessageTypes = ((MessageOptions & InteractionReplyOptions) | string)[];

export default MessageSender;
