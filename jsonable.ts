export interface JSONable {
    [key: string]: string | number | boolean | JSONable | JSONable[];
}
