export type IsLiteral<T> = string extends T ? false : true;
// type UnexpectedType<Message> = `Error: ${Message}`;
export interface UnexpectedType<Message extends string> {
	readonly message: Message;
}
export type EnsureLiteral<T, Message extends string> =
	IsLiteral<T> extends true ? T : UnexpectedType<Message> & string;
