import EventsListView from '../view/events-list-view';
import TripInfoView from '../view/trip-info-view';
import SortView from '../view/sort-view';
import {remove, render, RenderPosition} from '../framework/render';
import NoEventView from '../view/no-event-view';
import EventPresenter from './event-presenter';
import {DEFAULT_FILTER_TYPE, DEFAULT_SORT_TYPE, SortType, TimeLimit, UpdateType, UserAction} from '../const';
import {sortByDay, sortByPrice, sortByTime} from '../utils/event';
import {filter} from '../utils/filter';
import NewEventPresenter from './new-event-presenter';
import LoadingView from '../view/loading-view';
import UiBlocker from '../framework/ui-blocker/ui-blocker';

export default class TripPresenter {
  #headerElement = null;
  #filterElement = null;
  #eventsBoardElement = null;
  #tripModel = null;
  #filterModel = null;
  #sortComponent = null;
  #newEventPresenter = null;
  #currentSortType = DEFAULT_SORT_TYPE;
  #filterType = DEFAULT_FILTER_TYPE;
  #isLoading = true;
  #onNewEventDestroy = () => null;
  #eventPresenters = new Map();
  #eventsList = new EventsListView();
  #noEventComponent = null;
  #loadingComponent = new LoadingView();
  #uiBlocker = new UiBlocker({
    lowerLimit: TimeLimit.LOWER_LIMIT,
    upperLimit: TimeLimit.UPPER_LIMIT
  });

  constructor({
    headerElement,
    filtersElement,
    eventsBoardElement,
    tripModel,
    filterModel,
    onNewEventDestroy,
  }) {
    this.#headerElement = headerElement;
    this.#filterElement = filtersElement;
    this.#eventsBoardElement = eventsBoardElement;
    this.#tripModel = tripModel;
    this.#filterModel = filterModel;
    this.#onNewEventDestroy = onNewEventDestroy;

    this.#tripModel.addObserver(this.#modelEventHandler);
    this.#filterModel.addObserver(this.#modelEventHandler);
  }

  get events() {
    this.#filterType = this.#filterModel.filter;
    const filteredEvents = filter[this.#filterType](this.#tripModel.events);

    switch (this.#currentSortType) {
      case SortType.DAY:
        return filteredEvents.sort(sortByDay);
      case SortType.TIME:
        return filteredEvents.sort(sortByTime);
      case SortType.PRICE:
        return filteredEvents.sort(sortByPrice);
    }

    return filteredEvents;
  }

  get offers() {
    return this.#tripModel.offers;
  }

  get destinations() {
    return this.#tripModel.destinations;
  }

  init() {
    this.#renderTripInfo();
    this.#renderBoard();
  }

  addNewEvent() {
    this.#currentSortType = DEFAULT_SORT_TYPE;
    this.#eventPresenters.forEach((eventPresenter) => eventPresenter.closeEditEvent());
    this.#newEventPresenter.init();
  }

  #dataChangeHandler = async (actionType, updateType, update) => {
    this.#uiBlocker.block();

    switch (actionType) {
      case UserAction.UPDATE_EVENT:
        this.#eventPresenters.get(update.id).setSaving();
        try {
          await this.#tripModel.updateEvent(updateType, update);
        } catch (err) {
          this.#eventPresenters.get(update.id).setAborting();
        }
        break;
      case UserAction.ADD_EVENT:
        this.#newEventPresenter.setSaving();
        try {
          this.#tripModel.addEvent(updateType, update);
        } catch (err) {
          this.#newEventPresenter.setAborting();
        }
        break;
      case UserAction.DELETE_EVENT:
        this.#eventPresenters.get(update.id).setDeleting();
        try {
          this.#tripModel.deleteEvent(updateType, update);
        } catch (err) {
          this.#eventPresenters.get(update.id).setAborting();
        }
        break;
    }

    this.#uiBlocker.unblock();
  };

  #modelEventHandler = (updateType, event) => {
    switch (updateType) {
      case UpdateType.PATCH:
        this.#eventPresenters.get(event.id).init(event);
        break;
      case UpdateType.MINOR:
        this.#clearBoard();
        this.#renderBoard();
        break;
      case UpdateType.MAJOR:
        this.#clearBoard(true);
        this.#renderBoard();
        break;
      case UpdateType.INIT:
        this.#isLoading = false;
        remove(this.#loadingComponent);
        this.#renderBoard();
        break;
    }
  };

  #renderTripInfo() {
    render(new TripInfoView(), this.#headerElement, RenderPosition.AFTERBEGIN);
  }

  #renderSort() {
    this.#sortComponent = new SortView({
      currentSortType: this.#currentSortType,
      onChangeSortType: this.#changeSortTypeHandler,
    });
    render(this.#sortComponent, this.#eventsBoardElement);
  }

  #renderEvents() {
    render(this.#eventsList, this.#eventsBoardElement);

    for (const event of this.events) {
      const eventPresenter = new EventPresenter({
        eventsList: this.#eventsList.element,
        offers: this.offers,
        destinations: this.destinations,
        onClickEdit: this.#openEditEventHandler,
        onDataChange: this.#dataChangeHandler,
      });

      this.#eventPresenters.set(event.id, eventPresenter);
      eventPresenter.init(event);
    }
  }

  #renderLoading() {
    render(this.#loadingComponent, this.#eventsBoardElement, RenderPosition.AFTERBEGIN);
  }

  #renderNoEvents = () => {
    this.#noEventComponent = new NoEventView({filterType: this.#filterModel.filter});
    render(this.#noEventComponent, this.#eventsBoardElement);
  };

  #openEditEventHandler = () => {
    this.#newEventPresenter.destroy();
    this.#eventPresenters.forEach((eventPresenter) => eventPresenter.closeEditEvent());
  };

  #renderBoard() {
    if (this.#isLoading) {
      this.#renderLoading();
      return;
    }

    this.#newEventPresenter = new NewEventPresenter({
      eventsList: this.#eventsList.element,
      offers: this.offers,
      destinations: this.destinations,
      onDataChange: this.#dataChangeHandler,
      onDestroy:  this.#onNewEventDestroy,
    });

    if (this.events.length === 0) {
      this.#renderNoEvents();
      return;
    }

    this.#renderSort();
    this.#renderEvents();
  }

  #clearBoard(resetSortType = false) {
    this.#newEventPresenter.destroy();
    this.#eventPresenters.forEach((eventPresenter) => eventPresenter.destroy());
    this.#eventPresenters.clear();
    remove(this.#sortComponent);
    remove(this.#noEventComponent);
    remove(this.#eventsList);

    if (resetSortType) {
      this.#currentSortType = DEFAULT_SORT_TYPE;
    }
  }

  #changeSortTypeHandler = (sortType) => {
    if (this.#currentSortType === sortType) {
      return;
    }

    this.#currentSortType = sortType;

    this.#clearBoard();
    this.#renderSort();
    this.#renderEvents();
  };
}
