import BaseSite from './sites/BaseSite';

export default interface RunnerResponse {
    site: BaseSite;
    match: RegExpMatchArray;
}
